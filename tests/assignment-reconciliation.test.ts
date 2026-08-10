import { describe, expect, it } from 'vitest';
import type { Assignment, GradebookAssignment } from '$lib/models';
import { reconcileAssignments } from '$lib/server/matching/assignment-reconciliation';

function canvas(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'canvas:1',
    courseId: 'course:physics',
    title: 'Electromagnetic Induction Quiz',
    dueAt: '2026-08-10T18:00:00-07:00',
    submitted: true,
    submissionState: 'submitted',
    source: 'canvas',
    ...overrides
  };
}

function gradebook(overrides: Partial<GradebookAssignment> = {}): GradebookAssignment {
  return {
    id: 'studentvue:1',
    courseId: 'course:physics',
    title: 'Electromagnetic Induction Quiz',
    capturedAt: '2026-08-10T08:02:00-07:00',
    ...overrides
  };
}

describe('assignment reconciliation', () => {
  it('shows an official score for an exact normalized title match', () => {
    const result = reconcileAssignments(
      [canvas()],
      [
        gradebook({
          title: 'Electromagnetic-Induction Quiz!',
          pointsEarned: 17,
          pointsPossible: 20
        })
      ]
    ).get('canvas:1');

    expect(result).toEqual({
      state: 'complete',
      label: 'Complete · 17 / 20',
      gradebookAssignmentId: 'studentvue:1',
      pointsEarned: 17,
      pointsPossible: 20
    });
  });

  it('gives missing and excused states precedence over scores', () => {
    expect(
      reconcileAssignments([canvas()], [gradebook({ missing: true })]).get('canvas:1')?.state
    ).toBe('missing');
    expect(
      reconcileAssignments([canvas()], [gradebook({ excused: true })]).get('canvas:1')?.state
    ).toBe('excused');
  });

  it('flags a similar same-course title without merging it', () => {
    const result = reconcileAssignments(
      [canvas()],
      [gradebook({ title: 'Quiz: Electromagnetic Induction' })]
    ).get('canvas:1');

    expect(result).toEqual({ state: 'possible_mismatch', label: 'Possible gradebook mismatch' });
  });

  it('does not compare assignments across courses', () => {
    const result = reconcileAssignments(
      [canvas()],
      [gradebook({ courseId: 'course:government', missing: true })]
    ).get('canvas:1');

    expect(result).toEqual({ state: 'awaiting_grade', label: 'Submitted · awaiting grade' });
  });
});
