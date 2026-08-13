import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Assignment,
  CanvasSnapshot,
  Course,
  GradeChange,
  GradeChangeValue,
  GradeSnapshot,
  StudentVueSnapshot,
  SubmissionState,
  SyncRun
} from '$lib/models';
import type { SchoolDayRepository, StoredCourseMapping } from './repositories';

interface SQLiteGradeRepositoryOptions {
  migrationsDirectory?: string;
}

interface CourseGradeRow {
  course_id: string;
  percentage: number | null;
  letter_grade: string | null;
  raw_display: string | null;
  grading_period: string | null;
  captured_at: string;
}

interface AssignmentGradeRow {
  assignment_id: string;
  course_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  percentage: number | null;
  missing: number;
  excused: number;
  graded_at: string | null;
  captured_at: string;
}

interface GradeChangeRow {
  id: string;
  course_id: string;
  detected_at: string;
  type: GradeChange['type'];
  previous_value: string | null;
  current_value: string | null;
  assignment_id: string | null;
  assignment_title: string | null;
  acknowledged: number;
}

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function parseValue(value: string | null): GradeChangeValue | undefined {
  return value === null ? undefined : (JSON.parse(value) as GradeChangeValue);
}

export class SQLiteGradeRepository implements SchoolDayRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string, options: SQLiteGradeRepositoryOptions = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });

    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate(options.migrationsDirectory ?? resolve('migrations'));
    this.db.exec('PRAGMA journal_mode = WAL;');
  }

  private migrate(migrationsDirectory: string): void {
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    const migrations = ['initial', 'studentvue_cache', 'studentvue_link_cells'];
    for (let next = version.user_version + 1; next <= migrations.length; next += 1) {
      const migration = readFileSync(
        resolve(
          migrationsDirectory,
          `${String(next).padStart(4, '0')}_${migrations[next - 1]}.sql`
        ),
        'utf8'
      );
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration);
        this.db.exec(`PRAGMA user_version = ${next}; COMMIT`);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  async getLatestSnapshot(): Promise<GradeSnapshot | null> {
    const latest = this.db
      .prepare('SELECT MAX(captured_at) AS captured_at FROM grade_snapshots')
      .get() as { captured_at: string | null };
    if (!latest.captured_at) return null;

    const courseRows = this.db
      .prepare('SELECT * FROM course_grade_snapshots WHERE captured_at = ? ORDER BY course_id')
      .all(latest.captured_at) as unknown as CourseGradeRow[];
    const assignmentRows = this.db
      .prepare(
        'SELECT * FROM gradebook_assignment_snapshots WHERE captured_at = ? ORDER BY assignment_id'
      )
      .all(latest.captured_at) as unknown as AssignmentGradeRow[];

    return {
      capturedAt: latest.captured_at,
      courseGrades: courseRows.map((row) => ({
        courseId: row.course_id,
        percentage: optional(row.percentage),
        letterGrade: optional(row.letter_grade),
        rawDisplay: optional(row.raw_display),
        gradingPeriod: optional(row.grading_period),
        capturedAt: row.captured_at
      })),
      assignments: assignmentRows.map((row) => ({
        id: row.assignment_id,
        courseId: row.course_id,
        title: row.title,
        pointsEarned: optional(row.points_earned),
        pointsPossible: optional(row.points_possible),
        percentage: optional(row.percentage),
        missing: Boolean(row.missing),
        excused: Boolean(row.excused),
        gradedAt: optional(row.graded_at),
        capturedAt: row.captured_at
      }))
    };
  }

  async saveSnapshot(snapshot: GradeSnapshot): Promise<void> {
    const deleteCourseRows = this.db.prepare(
      'DELETE FROM course_grade_snapshots WHERE captured_at = ?'
    );
    const deleteAssignmentRows = this.db.prepare(
      'DELETE FROM gradebook_assignment_snapshots WHERE captured_at = ?'
    );
    const insertCourse = this.db.prepare(
      `INSERT INTO course_grade_snapshots
       (id, course_id, percentage, letter_grade, raw_display, grading_period, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssignment = this.db.prepare(
      `INSERT INTO gradebook_assignment_snapshots
       (id, assignment_id, course_id, title, points_earned, points_possible, percentage,
        missing, excused, graded_at, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertSnapshot = this.db.prepare(
      'INSERT OR REPLACE INTO grade_snapshots (captured_at) VALUES (?)'
    );

    this.db.exec('BEGIN IMMEDIATE');
    try {
      deleteCourseRows.run(snapshot.capturedAt);
      deleteAssignmentRows.run(snapshot.capturedAt);
      insertSnapshot.run(snapshot.capturedAt);
      for (const grade of snapshot.courseGrades) {
        insertCourse.run(
          `${snapshot.capturedAt}:${grade.courseId}`,
          grade.courseId,
          grade.percentage ?? null,
          grade.letterGrade ?? null,
          grade.rawDisplay ?? null,
          grade.gradingPeriod ?? null,
          snapshot.capturedAt
        );
      }
      for (const assignment of snapshot.assignments) {
        insertAssignment.run(
          `${snapshot.capturedAt}:${assignment.id}`,
          assignment.id,
          assignment.courseId,
          assignment.title,
          assignment.pointsEarned ?? null,
          assignment.pointsPossible ?? null,
          assignment.percentage ?? null,
          assignment.missing ? 1 : 0,
          assignment.excused ? 1 : 0,
          assignment.gradedAt ?? null,
          snapshot.capturedAt
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async appendGradeChanges(changes: readonly GradeChange[]): Promise<number> {
    if (changes.length === 0) return 0;
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO grade_changes
       (id, course_id, detected_at, type, previous_value, current_value,
        assignment_id, assignment_title, acknowledged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let inserted = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const change of changes) {
        const result = insert.run(
          change.id,
          change.courseId,
          change.detectedAt,
          change.type,
          change.previousValue === undefined ? null : JSON.stringify(change.previousValue),
          change.currentValue === undefined ? null : JSON.stringify(change.currentValue),
          change.assignmentId ?? null,
          change.assignmentTitle ?? null,
          change.acknowledged ? 1 : 0
        );
        inserted += Number(result.changes);
      }
      this.db.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listGradeChanges(limit = 10): Promise<GradeChange[]> {
    const rows = this.db
      .prepare('SELECT * FROM grade_changes ORDER BY detected_at DESC, id ASC LIMIT ?')
      .all(limit) as unknown as GradeChangeRow[];
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      detectedAt: row.detected_at,
      type: row.type,
      previousValue: parseValue(row.previous_value),
      currentValue: parseValue(row.current_value),
      assignmentId: optional(row.assignment_id),
      assignmentTitle: optional(row.assignment_title),
      acknowledged: Boolean(row.acknowledged)
    }));
  }

  async getLatestCanvasSnapshot(): Promise<CanvasSnapshot | null> {
    const latest = this.db
      .prepare('SELECT MAX(captured_at) AS captured_at FROM submissions')
      .get() as { captured_at: string | null };
    if (!latest.captured_at) return null;

    const courseRows = this.db
      .prepare(
        `SELECT DISTINCT c.id, c.name, c.short_name, c.period, c.teacher
         FROM courses c
         JOIN assignments a ON a.course_id = c.id
         JOIN submissions s ON s.assignment_id = a.id
         WHERE s.captured_at = ?
         ORDER BY c.name`
      )
      .all(latest.captured_at) as unknown as Array<{
      id: string;
      name: string;
      short_name: string | null;
      period: string | null;
      teacher: string | null;
    }>;
    const assignmentRows = this.db
      .prepare(
        `SELECT a.*, s.submitted, s.state
         FROM assignments a
         JOIN submissions s ON s.assignment_id = a.id
         WHERE s.captured_at = ?
         ORDER BY a.due_at, a.id`
      )
      .all(latest.captured_at) as unknown as Array<{
      id: string;
      course_id: string;
      external_id: string;
      title: string;
      due_at: string | null;
      points_possible: number | null;
      external_url: string | null;
      submitted: number;
      state: SubmissionState;
    }>;

    const courses: Course[] = courseRows.map((row) => ({
      id: row.id,
      externalIds: { canvas: row.id },
      name: row.name,
      shortName: optional(row.short_name),
      period: optional(row.period),
      teacher: optional(row.teacher)
    }));
    const assignments: Assignment[] = assignmentRows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      dueAt: row.due_at,
      pointsPossible: optional(row.points_possible),
      submitted: Boolean(row.submitted),
      submissionState: row.state,
      source: 'canvas',
      externalUrl: optional(row.external_url)
    }));
    return { capturedAt: latest.captured_at, courses, assignments };
  }

  async saveCanvasSnapshot(snapshot: CanvasSnapshot): Promise<void> {
    const upsertCourse = this.db.prepare(
      `INSERT INTO courses (id, name, short_name, period, teacher, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name,
       period=excluded.period, teacher=excluded.teacher, updated_at=CURRENT_TIMESTAMP`
    );
    const upsertAssignment = this.db.prepare(
      `INSERT INTO assignments
       (id, course_id, source, external_id, title, due_at, points_possible, external_url,
        first_seen_at, last_seen_at)
       VALUES (?, ?, 'canvas', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id, title=excluded.title,
       due_at=excluded.due_at, points_possible=excluded.points_possible,
       external_url=excluded.external_url, last_seen_at=excluded.last_seen_at`
    );
    const insertSubmission = this.db.prepare(
      `INSERT OR REPLACE INTO submissions
       (id, assignment_id, submitted, state, captured_at) VALUES (?, ?, ?, ?, ?)`
    );

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const course of snapshot.courses) {
        upsertCourse.run(
          course.id,
          course.name,
          course.shortName ?? null,
          course.period ?? null,
          course.teacher ?? null
        );
      }
      for (const assignment of snapshot.assignments) {
        upsertAssignment.run(
          assignment.id,
          assignment.courseId,
          assignment.id,
          assignment.title,
          assignment.dueAt,
          assignment.pointsPossible ?? null,
          assignment.externalUrl ?? null,
          snapshot.capturedAt,
          snapshot.capturedAt
        );
        insertSubmission.run(
          `${snapshot.capturedAt}:${assignment.id}`,
          assignment.id,
          assignment.submitted ? 1 : 0,
          assignment.submissionState,
          snapshot.capturedAt
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async getLatestStudentVueSnapshot(): Promise<StudentVueSnapshot | null> {
    const row = this.db
      .prepare("SELECT captured_at, payload_json FROM studentvue_cache WHERE owner_key = 'default'")
      .get() as { captured_at: string; payload_json: string } | undefined;
    if (!row) return null;
    const payload = JSON.parse(row.payload_json) as Omit<StudentVueSnapshot, 'capturedAt'>;
    return { capturedAt: row.captured_at, ...payload };
  }

  async saveStudentVueSnapshot(snapshot: StudentVueSnapshot): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO studentvue_cache (owner_key, captured_at, payload_json)
         VALUES ('default', ?, ?)
         ON CONFLICT(owner_key) DO UPDATE SET
           captured_at=excluded.captured_at, payload_json=excluded.payload_json`
      )
      .run(
        snapshot.capturedAt,
        JSON.stringify({ courses: snapshot.courses, snapshot: snapshot.snapshot })
      );
  }

  async saveSyncRun(run: SyncRun): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sync_runs
         (id, provider, started_at, completed_at, status, records_processed, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.provider,
        run.startedAt,
        run.completedAt ?? null,
        run.status,
        run.recordsProcessed ?? null,
        run.errorMessage ?? null
      );
  }

  async listCourseMappings(): Promise<StoredCourseMapping[]> {
    const rows = this.db
      .prepare(
        `SELECT schoolday_course_id, canvas_course_id, studentvue_course_id,
                belllogic_period_id, match_method, confidence
         FROM course_mappings ORDER BY schoolday_course_id`
      )
      .all() as unknown as Array<{
      schoolday_course_id: string;
      canvas_course_id: string | null;
      studentvue_course_id: string | null;
      belllogic_period_id: string | null;
      match_method: 'automatic' | 'manual';
      confidence: number | null;
    }>;
    return rows.map((row) => ({
      schoolDayCourseId: row.schoolday_course_id,
      canvasCourseId: optional(row.canvas_course_id),
      studentVueCourseId: optional(row.studentvue_course_id),
      bellLogicPeriodId: optional(row.belllogic_period_id),
      matchMethod: row.match_method,
      confidence: optional(row.confidence)
    }));
  }

  async saveCourseMappings(
    courses: readonly Course[],
    matchMethod: StoredCourseMapping['matchMethod'] = 'automatic',
    confidence = 1
  ): Promise<void> {
    const upsertCourse = this.db.prepare(
      `INSERT INTO courses (id, name, short_name, period, teacher, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name,
       period=excluded.period, teacher=excluded.teacher, updated_at=CURRENT_TIMESTAMP`
    );
    const upsertMapping = this.db.prepare(
      `INSERT INTO course_mappings
       (id, schoolday_course_id, canvas_course_id, studentvue_course_id,
        belllogic_period_id, match_method, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         canvas_course_id=COALESCE(excluded.canvas_course_id, canvas_course_id),
         studentvue_course_id=COALESCE(excluded.studentvue_course_id, studentvue_course_id),
         belllogic_period_id=COALESCE(excluded.belllogic_period_id, belllogic_period_id),
         match_method=CASE WHEN match_method='manual' THEN match_method ELSE excluded.match_method END,
         confidence=CASE WHEN match_method='manual' THEN confidence ELSE excluded.confidence END,
         updated_at=CURRENT_TIMESTAMP`
    );

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const course of courses) {
        upsertCourse.run(
          course.id,
          course.name,
          course.shortName ?? null,
          course.period ?? null,
          course.teacher ?? null
        );
        upsertMapping.run(
          `mapping:${course.id}`,
          course.id,
          course.externalIds.canvas ?? null,
          course.externalIds.studentVue ?? null,
          course.externalIds.bellLogic ?? null,
          matchMethod,
          confidence
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
