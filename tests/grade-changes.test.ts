import { describe, expect, it } from 'vitest';
import type { CourseGrade, GradeSnapshot, GradebookAssignment } from '$lib/models';
import { InMemoryGradeRepository } from '$lib/server/db/in-memory-grade-repository';
import { detectGradeChanges } from '$lib/server/grade-changes/detect-grade-changes';
import { MockStudentVueProvider } from '$lib/server/providers/mock/mock-studentvue-provider';
import { syncGradebookSnapshot } from '$lib/server/sync/gradebook-sync';

const beforeTime = '2026-08-07T16:00:00-07:00';
const afterTime = '2026-08-10T09:00:00-07:00';

function grade(percentage: number, capturedAt = beforeTime): CourseGrade {
  return { courseId: 'course-physics', percentage, capturedAt };
}

function gradebookAssignment(overrides: Partial<GradebookAssignment> = {}): GradebookAssignment {
  return {
    id: 'assignment-quiz',
    courseId: 'course-physics',
    title: 'Electromagnetic Induction Quiz',
    pointsPossible: 20,
    missing: false,
    excused: false,
    capturedAt: beforeTime,
    ...overrides
  };
}

function snapshot(
  courseGrades: CourseGrade[] = [],
  assignments: GradebookAssignment[] = [],
  capturedAt = beforeTime
): GradeSnapshot {
  return { capturedAt, courseGrades, assignments };
}

describe('grade-change detection', () => {
  it('detects a course grade increase', () => {
    const changes = detectGradeChanges(
      snapshot([grade(91.2)]),
      snapshot([grade(92, afterTime)], [], afterTime)
    );

    expect(changes).toMatchObject([
      { type: 'course_grade_changed', previousValue: 91.2, currentValue: 92 }
    ]);
  });

  it('detects a course grade decrease', () => {
    const changes = detectGradeChanges(
      snapshot([grade(93.2)]),
      snapshot([grade(91.8, afterTime)], [], afterTime)
    );

    expect(changes[0]).toMatchObject({
      type: 'course_grade_changed',
      previousValue: 93.2,
      currentValue: 91.8
    });
  });

  it('detects the first assignment grade posted', () => {
    const changes = detectGradeChanges(
      snapshot([], [gradebookAssignment()]),
      snapshot(
        [],
        [gradebookAssignment({ pointsEarned: 17, percentage: 85, capturedAt: afterTime })],
        afterTime
      )
    );

    expect(changes).toMatchObject([
      { type: 'assignment_graded', previousValue: null, currentValue: '17 / 20' }
    ]);
  });

  it('ignores a newly created assignment that has not been graded', () => {
    const changes = detectGradeChanges(
      snapshot(),
      snapshot([], [gradebookAssignment({ pointsPossible: 1, capturedAt: afterTime })], afterTime)
    );

    expect(changes).toEqual([]);
  });

  it('detects an assignment score correction as one meaningful event', () => {
    const changes = detectGradeChanges(
      snapshot([], [gradebookAssignment({ pointsEarned: 15, percentage: 75 })]),
      snapshot(
        [],
        [gradebookAssignment({ pointsEarned: 18, percentage: 90, capturedAt: afterTime })],
        afterTime
      )
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'assignment_score_changed',
      previousValue: '15 / 20',
      currentValue: '18 / 20'
    });
  });

  it('detects a missing status being added', () => {
    const changes = detectGradeChanges(
      snapshot([], [gradebookAssignment({ missing: false })]),
      snapshot([], [gradebookAssignment({ missing: true, capturedAt: afterTime })], afterTime)
    );

    expect(changes).toMatchObject([
      { type: 'missing_status_changed', previousValue: false, currentValue: true }
    ]);
  });

  it('detects a missing assignment being resolved', () => {
    const changes = detectGradeChanges(
      snapshot([], [gradebookAssignment({ missing: true })]),
      snapshot([], [gradebookAssignment({ missing: false, capturedAt: afterTime })], afterTime)
    );

    expect(changes).toMatchObject([
      { type: 'missing_status_changed', previousValue: true, currentValue: false }
    ]);
  });

  it('ignores identical meaningful values when only metadata timestamps changed', () => {
    const previous = gradebookAssignment({
      pointsEarned: 18,
      percentage: 90,
      gradedAt: '2026-08-05T12:00:00-07:00'
    });
    const current = gradebookAssignment({
      pointsEarned: 18,
      percentage: 90,
      gradedAt: '2026-08-05T12:00:00-07:00',
      capturedAt: afterTime
    });

    expect(
      detectGradeChanges(snapshot([], [previous]), snapshot([], [current], afterTime))
    ).toEqual([]);
  });

  it('persists no new events when the same incoming snapshot is synced twice', async () => {
    const repository = new InMemoryGradeRepository();
    const previous = snapshot([grade(91.2)], [], beforeTime);
    const current = snapshot([grade(92, afterTime)], [], afterTime);

    await syncGradebookSnapshot(repository, previous);
    const first = await syncGradebookSnapshot(repository, current);
    const second = await syncGradebookSnapshot(repository, current);

    expect(first.changesPersisted).toBe(1);
    expect(second.changesDetected).toBe(0);
    expect(second.changesPersisted).toBe(0);
    expect(await repository.listGradeChanges()).toHaveLength(1);
  });

  it('uses the before/after fixtures to generate the demo feed while ignoring an unchanged item', async () => {
    const beforeProvider = new MockStudentVueProvider('before');
    const afterProvider = new MockStudentVueProvider('after');
    const changes = detectGradeChanges(
      await beforeProvider.getSnapshot(),
      await afterProvider.getSnapshot()
    );

    expect(changes).toHaveLength(7);
    expect(changes.some((change) => change.type === 'assignment_graded')).toBe(true);
    expect(changes.some((change) => change.type === 'assignment_score_changed')).toBe(true);
    expect(changes.filter((change) => change.type === 'missing_status_changed')).toHaveLength(2);
    expect(changes.some((change) => change.assignmentId === 'studentvue:SV-PHY-HW1')).toBe(false);
  });
});
