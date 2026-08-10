import type {
  Assignment,
  CanvasSnapshot,
  Course,
  CourseGrade,
  DashboardData,
  GradeSnapshot,
  GradebookAssignment,
  ProviderSyncStatus,
  SchoolDay,
  SyncRun
} from '$lib/models';
import type { SchoolDayRepository } from '$lib/server/db/repositories';
import { InMemoryGradeRepository } from '$lib/server/db/in-memory-grade-repository';
import { SQLiteGradeRepository } from '$lib/server/db/sqlite-grade-repository';
import { normalizeAssignmentTitle } from '$lib/server/matching/assignment-title';
import { reconcileAssignments } from '$lib/server/matching/assignment-reconciliation';
import {
  matchPeriodsToCourses,
  remapAssignments,
  remapCourseGrades,
  remapGradebookAssignments
} from '$lib/server/matching/course-matcher';
import {
  matchAndPersistCourses,
  persistBellLogicPeriodMappings
} from '$lib/server/matching/durable-course-matcher';
import { rankAssignments } from '$lib/server/priority/priority-engine';
import { dateKeyInPhoenix } from '$lib/server/providers/belllogic/normalize';
import { createCanvasProvider } from '$lib/server/providers/canvas-provider';
import type {
  CanvasProvider as CanvasProviderContract,
  GradebookProvider,
  ScheduleProvider
} from '$lib/server/providers/contracts';
import { MockBellLogicProvider } from '$lib/server/providers/mock/mock-belllogic-provider';
import { MockCanvasProvider } from '$lib/server/providers/mock/mock-canvas-provider';
import { MockStudentVueProvider } from '$lib/server/providers/mock/mock-studentvue-provider';
import { createScheduleProvider } from '$lib/server/providers/schedule-provider';
import { StudentVueWebProvider } from '$lib/server/providers/studentvue/web-provider';
import { calculateScheduleState } from '$lib/server/schedule/calculate-schedule-state';
import { syncGradebookSnapshot } from '$lib/server/sync/gradebook-sync';

export const FIXTURE_NOW = '2026-08-10T09:10:00-07:00';

export interface DashboardRuntimeEnvironment {
  SCHOOLDAY_DB_PATH?: string;
  SCHOOLDAY_DISPLAY_NAME?: string;
  CANVAS_BASE_URL?: string;
  CANVAS_TOKEN?: string;
  BELLLOGIC_API_URL?: string;
  BELLLOGIC_REQUEST_ORIGIN?: string;
  STUDENTVUE_BASE_URL?: string;
  STUDENTVUE_USERNAME?: string;
  STUDENTVUE_PASSWORD?: string;
}

interface CanvasSource {
  provider: CanvasProviderContract;
  mode: 'live' | 'fixture';
  configured: boolean;
}

interface ScheduleSource {
  provider: ScheduleProvider;
  mode: 'live' | 'fixture';
  configured: boolean;
}

interface StudentVueSource {
  provider: GradebookProvider;
  mode: 'live' | 'fixture';
  configured: boolean;
}

interface DashboardServiceOptions {
  now: () => Date;
  displayName?: string;
  canvas: CanvasSource;
  schedule: ScheduleSource;
  studentVue: StudentVueSource;
  cacheDashboard?: boolean;
  forceRefresh?: boolean;
  persistFixtureGrades?: boolean;
}

interface CanvasDashboardData {
  courses: Course[];
  assignments: Assignment[];
  status: ProviderSyncStatus;
}

interface ScheduleDashboardData {
  periods: Awaited<ReturnType<ScheduleProvider['getPeriods']>>;
  schoolDay: SchoolDay;
  status: ProviderSyncStatus;
}

interface GradebookDashboardData {
  courses: Course[];
  previousSnapshot: GradeSnapshot;
  currentSnapshot: GradeSnapshot;
  status: ProviderSyncStatus;
  persist: boolean;
}

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createCanvasSource(environment: DashboardRuntimeEnvironment): CanvasSource {
  const baseUrl = configuredValue(environment.CANVAS_BASE_URL);
  const token = configuredValue(environment.CANVAS_TOKEN);
  if (!baseUrl || !token) {
    return {
      provider: new MockCanvasProvider(),
      mode: 'fixture',
      configured: Boolean(baseUrl || token)
    };
  }

  return {
    provider: createCanvasProvider({ mode: 'canvas', baseUrl, token }),
    mode: 'live',
    configured: true
  };
}

const scheduleProviders = new Map<string, ScheduleProvider>();

function createScheduleSource(
  environment: DashboardRuntimeEnvironment,
  forceRefresh = false
): ScheduleSource {
  const apiUrl = configuredValue(environment.BELLLOGIC_API_URL);
  const origin = configuredValue(environment.BELLLOGIC_REQUEST_ORIGIN);
  if (!apiUrl || !origin) {
    return {
      provider: new MockBellLogicProvider(),
      mode: 'fixture',
      configured: Boolean(apiUrl || origin)
    };
  }

  const key = `${apiUrl}\n${origin}`;
  let provider = forceRefresh ? undefined : scheduleProviders.get(key);
  if (!provider) {
    provider = createScheduleProvider({
      mode: 'belllogic',
      apiUrl,
      origin,
      cacheTtlMs: 15 * 60 * 1000
    });
    if (!forceRefresh) scheduleProviders.set(key, provider);
  }

  return {
    provider,
    mode: 'live',
    configured: true
  };
}

function createStudentVueSource(environment: DashboardRuntimeEnvironment): StudentVueSource {
  const baseUrl = configuredValue(environment.STUDENTVUE_BASE_URL);
  const username = configuredValue(environment.STUDENTVUE_USERNAME);
  const password = configuredValue(environment.STUDENTVUE_PASSWORD);
  if (!baseUrl || !username || !password) {
    return {
      provider: new MockStudentVueProvider(),
      mode: 'fixture',
      configured: Boolean(baseUrl || username || password)
    };
  }

  return {
    provider: new StudentVueWebProvider({ baseUrl, username, password }),
    mode: 'live',
    configured: true
  };
}

function fixtureStatus(
  provider: ProviderSyncStatus['provider'],
  generatedAt: string,
  configured: boolean
): ProviderSyncStatus {
  const name =
    provider === 'bellLogic' ? 'Bell-Logic' : provider === 'studentVue' ? 'StudentVUE' : 'Canvas';
  return {
    provider,
    status: configured ? 'error' : 'fixture',
    lastUpdatedAt: generatedAt,
    label: configured ? `${name} configuration incomplete; using fixtures` : `${name} fixtures`
  };
}

function remapSnapshot(
  snapshot: GradeSnapshot,
  courseMapping: ReadonlyMap<string, string>
): GradeSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    courseGrades: remapCourseGrades(snapshot.courseGrades, courseMapping),
    assignments: remapGradebookAssignments(snapshot.assignments, courseMapping)
  };
}

function assignmentStatusIds(
  assignments: readonly Assignment[],
  gradebookAssignments: readonly GradebookAssignment[],
  status: 'missing' | 'excused'
): Set<string> {
  const matchingKeys = new Set(
    gradebookAssignments
      .filter((assignment) => Boolean(assignment[status]))
      .map((assignment) => `${assignment.courseId}:${normalizeAssignmentTitle(assignment.title)}`)
  );

  return new Set(
    assignments
      .filter((assignment) =>
        matchingKeys.has(`${assignment.courseId}:${normalizeAssignmentTitle(assignment.title)}`)
      )
      .map((assignment) => assignment.id)
  );
}

function courseGradeSummaries(
  courses: readonly Course[],
  previous: readonly CourseGrade[],
  current: readonly CourseGrade[]
): DashboardData['grades'] {
  const courseById = new Map(courses.map((course) => [course.id, course] as const));
  const previousByCourse = new Map(previous.map((grade) => [grade.courseId, grade] as const));

  return current.flatMap((grade) => {
    const course = courseById.get(grade.courseId);
    if (!course) return [];
    const previousPercentage = previousByCourse.get(grade.courseId)?.percentage;
    const movement =
      previousPercentage === undefined || grade.percentage === undefined
        ? undefined
        : Math.round((grade.percentage - previousPercentage) * 10) / 10;
    return [
      {
        ...grade,
        course,
        previousPercentage,
        movement: movement === 0 ? undefined : movement
      }
    ];
  });
}

function upcomingAssignments(
  assignments: readonly Assignment[],
  courses: readonly Course[],
  gradebookAssignments: readonly GradebookAssignment[],
  now: Date
): DashboardData['upcomingAssignments'] {
  const courseById = new Map(courses.map((course) => [course.id, course] as const));
  const reconciliationByAssignment = reconcileAssignments(assignments, gradebookAssignments);
  const windowEnd = now.getTime() + 7 * 24 * 60 * 60 * 1000;

  return assignments
    .filter((assignment) => {
      if (!assignment.dueAt) return false;
      const due = new Date(assignment.dueAt).getTime();
      return due >= now.getTime() && due <= windowEnd;
    })
    .flatMap((assignment) => {
      const course = courseById.get(assignment.courseId);
      const reconciliation = reconciliationByAssignment.get(assignment.id);
      return course && reconciliation ? [{ ...assignment, course, reconciliation }] : [];
    })
    .sort(
      (left, right) => new Date(left.dueAt ?? 0).getTime() - new Date(right.dueAt ?? 0).getTime()
    );
}

export class DashboardService {
  private initialized: Promise<DashboardData> | null = null;

  constructor(
    private readonly repository: SchoolDayRepository,
    private readonly options: DashboardServiceOptions = {
      now: () => new Date(FIXTURE_NOW),
      canvas: { provider: new MockCanvasProvider(), mode: 'fixture', configured: false },
      schedule: {
        provider: new MockBellLogicProvider('regular-a'),
        mode: 'fixture',
        configured: false
      },
      studentVue: {
        provider: new MockStudentVueProvider(),
        mode: 'fixture',
        configured: false
      },
      cacheDashboard: true
    }
  ) {}

  getDashboard(): Promise<DashboardData> {
    if (!this.options.cacheDashboard) return this.buildDashboard();
    this.initialized ??= this.buildDashboard();
    return this.initialized;
  }

  private async loadCanvas(now: Date): Promise<CanvasDashboardData> {
    const generatedAt = now.toISOString();
    if (this.options.canvas.mode === 'fixture') {
      const [courses, assignments] = await Promise.all([
        this.options.canvas.provider.getCourses(),
        this.options.canvas.provider.getAssignments()
      ]);
      return {
        courses,
        assignments,
        status: fixtureStatus('canvas', generatedAt, this.options.canvas.configured)
      };
    }

    const cached = await this.repository.getLatestCanvasSnapshot();
    const cacheAge = cached ? now.getTime() - new Date(cached.capturedAt).getTime() : Infinity;
    const cacheIsFresh = cacheAge >= 0 && cacheAge < 15 * 60 * 1000;
    if (cached && cacheIsFresh && !this.options.forceRefresh) {
      return {
        courses: cached.courses,
        assignments: cached.assignments,
        status: {
          provider: 'canvas',
          status: 'live',
          lastUpdatedAt: cached.capturedAt,
          label: 'Canvas cached'
        }
      };
    }

    const run = this.startedSyncRun('canvas', generatedAt);
    await this.repository.saveSyncRun(run);
    try {
      const [courses, assignments] = await Promise.all([
        this.options.canvas.provider.getCourses(),
        this.options.canvas.provider.getAssignments()
      ]);
      const snapshot: CanvasSnapshot = { capturedAt: generatedAt, courses, assignments };
      await this.repository.saveCanvasSnapshot(snapshot);
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'success',
        recordsProcessed: courses.length + assignments.length
      });
      return {
        courses,
        assignments,
        status: {
          provider: 'canvas',
          status: 'live',
          lastUpdatedAt: generatedAt,
          label: 'Canvas live'
        }
      };
    } catch {
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'Canvas refresh failed'
      });
      if (cached) {
        return {
          courses: cached.courses,
          assignments: cached.assignments,
          status: {
            provider: 'canvas',
            status: 'error',
            lastUpdatedAt: cached.capturedAt,
            label: 'Canvas unavailable; showing saved assignments'
          }
        };
      }
      const fallback = new MockCanvasProvider();
      const [courses, assignments] = await Promise.all([
        fallback.getCourses(),
        fallback.getAssignments()
      ]);
      return {
        courses,
        assignments,
        status: {
          provider: 'canvas',
          status: 'error',
          lastUpdatedAt: generatedAt,
          label: 'Canvas unavailable; using fixtures'
        }
      };
    }
  }

  private startedSyncRun(provider: SyncRun['provider'], startedAt: string): SyncRun {
    return {
      id: `${provider}:${startedAt}:${crypto.randomUUID()}`,
      provider,
      startedAt,
      status: 'started'
    };
  }

  private async loadSchedule(now: Date): Promise<ScheduleDashboardData> {
    const generatedAt = now.toISOString();
    if (this.options.schedule.mode === 'fixture') {
      const weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'America/Phoenix'
      }).format(now);
      if (weekday === 'Sat' || weekday === 'Sun') {
        return {
          periods: [],
          schoolDay: { date: dateKeyInPhoenix(now), isSchoolDay: false },
          status: fixtureStatus('bellLogic', generatedAt, this.options.schedule.configured)
        };
      }

      const [periods, schoolDay] = await Promise.all([
        this.options.schedule.provider.getPeriods(now),
        this.options.schedule.provider.getSchoolDay(now)
      ]);
      return {
        periods,
        schoolDay,
        status: fixtureStatus('bellLogic', generatedAt, this.options.schedule.configured)
      };
    }

    const run = this.startedSyncRun('bellLogic', generatedAt);
    await this.repository.saveSyncRun(run);
    try {
      const [periods, schoolDay] = await Promise.all([
        this.options.schedule.provider.getPeriods(now),
        this.options.schedule.provider.getSchoolDay(now)
      ]);
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'success',
        recordsProcessed: periods.length
      });
      return {
        periods,
        schoolDay,
        status: {
          provider: 'bellLogic',
          status: 'live',
          lastUpdatedAt: generatedAt,
          label: 'Bell-Logic live'
        }
      };
    } catch {
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'Bell-Logic refresh failed'
      });
      return {
        periods: [],
        schoolDay: { date: dateKeyInPhoenix(now), isSchoolDay: false },
        status: {
          provider: 'bellLogic',
          status: 'error',
          lastUpdatedAt: generatedAt,
          label: 'Bell-Logic unavailable; schedule hidden'
        }
      };
    }
  }

  private async loadGradebook(now: Date): Promise<GradebookDashboardData> {
    const generatedAt = now.toISOString();
    const fixtureBefore = new MockStudentVueProvider('before');
    const fixtureAfter = new MockStudentVueProvider('after');

    if (this.options.studentVue.mode === 'fixture') {
      const [courses, previousSnapshot, currentSnapshot] = await Promise.all([
        fixtureAfter.getCourses(),
        fixtureBefore.getSnapshot(),
        fixtureAfter.getSnapshot()
      ]);
      return {
        courses,
        previousSnapshot,
        currentSnapshot,
        status: fixtureStatus(
          'studentVue',
          currentSnapshot.capturedAt,
          this.options.studentVue.configured
        ),
        persist: this.options.persistFixtureGrades ?? true
      };
    }

    const cached = await this.repository.getLatestStudentVueSnapshot();
    const cacheAge = cached ? now.getTime() - new Date(cached.capturedAt).getTime() : Infinity;
    const cacheIsFresh = cacheAge >= 0 && cacheAge < 30 * 60 * 1000;
    if (cached && cacheIsFresh && !this.options.forceRefresh) {
      return {
        courses: cached.courses,
        previousSnapshot: cached.snapshot,
        currentSnapshot: cached.snapshot,
        status: {
          provider: 'studentVue',
          status: 'live',
          lastUpdatedAt: cached.capturedAt,
          label: 'StudentVUE cached'
        },
        persist: false
      };
    }

    const run = this.startedSyncRun('studentVue', generatedAt);
    await this.repository.saveSyncRun(run);
    try {
      const [courses, currentSnapshot] = await Promise.all([
        this.options.studentVue.provider.getCourses(),
        this.options.studentVue.provider.getSnapshot()
      ]);
      const previousSnapshot = cached?.snapshot ?? currentSnapshot;
      await this.repository.saveStudentVueSnapshot({
        capturedAt: currentSnapshot.capturedAt,
        courses,
        snapshot: currentSnapshot
      });
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'success',
        recordsProcessed:
          courses.length + currentSnapshot.courseGrades.length + currentSnapshot.assignments.length
      });
      return {
        courses,
        previousSnapshot,
        currentSnapshot,
        status: {
          provider: 'studentVue',
          status: 'live',
          lastUpdatedAt: currentSnapshot.capturedAt,
          label: 'StudentVUE live'
        },
        persist: true
      };
    } catch {
      await this.repository.saveSyncRun({
        ...run,
        completedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'StudentVUE refresh failed'
      });
      if (cached) {
        return {
          courses: cached.courses,
          previousSnapshot: cached.snapshot,
          currentSnapshot: cached.snapshot,
          status: {
            provider: 'studentVue',
            status: 'error',
            lastUpdatedAt: cached.capturedAt,
            label: 'StudentVUE unavailable; showing saved grades'
          },
          persist: false
        };
      }
      const [courses, previousSnapshot, currentSnapshot] = await Promise.all([
        fixtureAfter.getCourses(),
        fixtureBefore.getSnapshot(),
        fixtureAfter.getSnapshot()
      ]);
      return {
        courses,
        previousSnapshot,
        currentSnapshot,
        status: {
          provider: 'studentVue',
          status: 'error',
          lastUpdatedAt: generatedAt,
          label: 'StudentVUE unavailable; using fixtures'
        },
        persist: false
      };
    }
  }

  private async buildDashboard(): Promise<DashboardData> {
    const now = this.options.now();
    const generatedAt = now.toISOString();
    const [canvasData, scheduleData, gradebookData] = await Promise.all([
      this.loadCanvas(now),
      this.loadSchedule(now),
      this.loadGradebook(now)
    ]);

    const matched = await matchAndPersistCourses(
      [canvasData.courses, gradebookData.courses],
      this.repository
    );
    const assignments = remapAssignments(
      canvasData.assignments,
      matched.sourceCourseIdToSchoolDayId
    );
    const schedule = matchPeriodsToCourses(scheduleData.periods, matched.courses);
    await persistBellLogicPeriodMappings(matched.courses, schedule, this.repository);
    const scheduleState = calculateScheduleState(schedule, now, scheduleData.schoolDay.isSchoolDay);
    const previousSnapshot = remapSnapshot(
      gradebookData.previousSnapshot,
      matched.sourceCourseIdToSchoolDayId
    );
    const currentSnapshot = remapSnapshot(
      gradebookData.currentSnapshot,
      matched.sourceCourseIdToSchoolDayId
    );

    if (gradebookData.persist) {
      const persistedSnapshot = await this.repository.getLatestSnapshot();
      if (!persistedSnapshot && this.options.studentVue.mode === 'fixture') {
        await syncGradebookSnapshot(this.repository, previousSnapshot);
      }
      await syncGradebookSnapshot(this.repository, currentSnapshot);
    }

    const currentGradebook = gradebookData.persist
      ? ((await this.repository.getLatestSnapshot()) ?? currentSnapshot)
      : currentSnapshot;
    const todayCourseIds = new Set(
      schedule.flatMap((period) => (period.courseId ? [period.courseId] : []))
    );
    const missingAssignmentIds = assignmentStatusIds(
      assignments,
      currentGradebook.assignments,
      'missing'
    );
    const excusedAssignmentIds = assignmentStatusIds(
      assignments,
      currentGradebook.assignments,
      'excused'
    );

    return {
      generatedAt,
      displayName: this.options.displayName ?? 'Student',
      schoolDay: scheduleData.schoolDay,
      scheduleState,
      priorityAssignments: rankAssignments({
        assignments,
        courses: matched.courses,
        now,
        todayCourseIds,
        missingAssignmentIds,
        excusedAssignmentIds
      }).slice(0, 4),
      upcomingAssignments: upcomingAssignments(
        assignments,
        matched.courses,
        currentGradebook.assignments,
        now
      ),
      grades: courseGradeSummaries(
        matched.courses,
        previousSnapshot.courseGrades,
        currentGradebook.courseGrades
      ),
      gradeChanges: await this.repository.listGradeChanges(8),
      courses: matched.courses,
      schedule,
      syncStatus: [canvasData.status, gradebookData.status, scheduleData.status]
    };
  }
}

const fixtureDashboardService = new DashboardService(new InMemoryGradeRepository());

export function getFixtureDashboard(): Promise<DashboardData> {
  return fixtureDashboardService.getDashboard();
}

const fixtureRuntimeGradeRepository = new InMemoryGradeRepository();
const liveStudentVueRuntimeGradeRepository = new InMemoryGradeRepository();
const sqliteRepositories = new Map<string, SQLiteGradeRepository>();

function sqliteRepository(databasePath: string): SQLiteGradeRepository {
  let repository = sqliteRepositories.get(databasePath);
  if (!repository) {
    repository = new SQLiteGradeRepository(databasePath);
    sqliteRepositories.set(databasePath, repository);
  }
  return repository;
}

export function ensureDashboardStorage(
  environment: DashboardRuntimeEnvironment
): 'sqlite' | 'memory' {
  const databasePath = configuredValue(environment.SCHOOLDAY_DB_PATH);
  if (!databasePath) return 'memory';
  sqliteRepository(databasePath);
  return 'sqlite';
}

function runtimeRepository(
  environment: DashboardRuntimeEnvironment,
  studentVueMode: StudentVueSource['mode'],
  hasLiveProvider: boolean
): SchoolDayRepository {
  const databasePath = configuredValue(environment.SCHOOLDAY_DB_PATH);
  if (!databasePath || !hasLiveProvider) {
    return studentVueMode === 'live'
      ? liveStudentVueRuntimeGradeRepository
      : fixtureRuntimeGradeRepository;
  }
  return sqliteRepository(databasePath);
}

export function getConfiguredDashboard(
  environment: DashboardRuntimeEnvironment,
  options: { forceRefresh?: boolean } = {}
): Promise<DashboardData> {
  const canvas = createCanvasSource(environment);
  const schedule = createScheduleSource(environment, options.forceRefresh);
  const studentVue = createStudentVueSource(environment);
  const fixtureOnly =
    canvas.mode === 'fixture' && schedule.mode === 'fixture' && studentVue.mode === 'fixture';
  const service = new DashboardService(
    runtimeRepository(environment, studentVue.mode, !fixtureOnly),
    {
      now: () => (fixtureOnly ? new Date(FIXTURE_NOW) : new Date()),
      displayName: configuredValue(environment.SCHOOLDAY_DISPLAY_NAME) ?? 'Student',
      canvas,
      schedule,
      studentVue,
      forceRefresh: options.forceRefresh,
      persistFixtureGrades: fixtureOnly || !configuredValue(environment.SCHOOLDAY_DB_PATH)
    }
  );
  return service.getDashboard();
}
