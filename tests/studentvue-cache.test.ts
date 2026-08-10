import { describe, expect, it, vi } from 'vitest';
import type { GradeSnapshot } from '$lib/models';
import { DashboardService } from '$lib/server/dashboard/dashboard-service';
import { InMemoryGradeRepository } from '$lib/server/db/in-memory-grade-repository';
import { MockBellLogicProvider } from '$lib/server/providers/mock/mock-belllogic-provider';
import { MockCanvasProvider } from '$lib/server/providers/mock/mock-canvas-provider';

const now = new Date('2026-08-10T16:00:00.000Z');
const courses = [
  {
    id: 'studentvue:math',
    externalIds: { studentVue: 'studentvue:math' },
    name: 'Algebra II'
  }
];
const snapshot: GradeSnapshot = {
  capturedAt: '2026-08-10T15:45:00.000Z',
  courseGrades: [
    { courseId: 'studentvue:math', percentage: 92, capturedAt: '2026-08-10T15:45:00.000Z' }
  ],
  assignments: []
};

function service(
  repository: InMemoryGradeRepository,
  provider: {
    getCourses: () => Promise<typeof courses>;
    getSnapshot: () => Promise<GradeSnapshot>;
    getCourseGrades: () => Promise<GradeSnapshot['courseGrades']>;
    getGradebookAssignments: () => Promise<GradeSnapshot['assignments']>;
  },
  forceRefresh = false
) {
  return new DashboardService(repository, {
    now: () => now,
    canvas: { provider: new MockCanvasProvider(), mode: 'fixture', configured: false },
    schedule: {
      provider: new MockBellLogicProvider('regular-a'),
      mode: 'fixture',
      configured: false
    },
    studentVue: { provider, mode: 'live', configured: true },
    forceRefresh,
    persistFixtureGrades: false
  });
}

describe('StudentVUE briefing cache', () => {
  it('uses a snapshot younger than 30 minutes without contacting StudentVUE', async () => {
    const repository = new InMemoryGradeRepository();
    await repository.saveStudentVueSnapshot({ capturedAt: snapshot.capturedAt, courses, snapshot });
    const provider = {
      getCourses: vi.fn(async () => courses),
      getSnapshot: vi.fn(async () => snapshot),
      getCourseGrades: vi.fn(async () => snapshot.courseGrades),
      getGradebookAssignments: vi.fn(async () => snapshot.assignments)
    };

    const dashboard = await service(repository, provider).getDashboard();

    expect(provider.getCourses).not.toHaveBeenCalled();
    expect(provider.getSnapshot).not.toHaveBeenCalled();
    expect(dashboard.syncStatus.find((item) => item.provider === 'studentVue')).toMatchObject({
      status: 'live',
      label: 'StudentVUE cached',
      lastUpdatedAt: snapshot.capturedAt
    });
  });

  it('bypasses the cadence for a forced refresh', async () => {
    const repository = new InMemoryGradeRepository();
    await repository.saveStudentVueSnapshot({ capturedAt: snapshot.capturedAt, courses, snapshot });
    const refreshed = { ...snapshot, capturedAt: now.toISOString() };
    const provider = {
      getCourses: vi.fn(async () => courses),
      getSnapshot: vi.fn(async () => refreshed),
      getCourseGrades: vi.fn(async () => refreshed.courseGrades),
      getGradebookAssignments: vi.fn(async () => refreshed.assignments)
    };

    const dashboard = await service(repository, provider, true).getDashboard();

    expect(provider.getSnapshot).toHaveBeenCalledOnce();
    expect(dashboard.syncStatus.find((item) => item.provider === 'studentVue')).toMatchObject({
      status: 'live',
      label: 'StudentVUE live'
    });
  });

  it('shows saved grades when a stale refresh fails', async () => {
    const repository = new InMemoryGradeRepository();
    const stale = { ...snapshot, capturedAt: '2026-08-10T14:00:00.000Z' };
    await repository.saveStudentVueSnapshot({
      capturedAt: stale.capturedAt,
      courses,
      snapshot: stale
    });
    const provider = {
      getCourses: vi.fn(async () => {
        throw new Error('offline');
      }),
      getSnapshot: vi.fn(async () => {
        throw new Error('offline');
      }),
      getCourseGrades: vi.fn(async () => stale.courseGrades),
      getGradebookAssignments: vi.fn(async () => stale.assignments)
    };

    const dashboard = await service(repository, provider).getDashboard();

    expect(dashboard.grades[0]?.percentage).toBe(92);
    expect(dashboard.syncStatus.find((item) => item.provider === 'studentVue')).toMatchObject({
      status: 'error',
      label: 'StudentVUE unavailable; showing saved grades',
      lastUpdatedAt: stale.capturedAt
    });
  });
});
