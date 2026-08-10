import { describe, expect, it } from 'vitest';
import type { Assignment, Course } from '$lib/models';
import { rankAssignments } from '$lib/server/priority/priority-engine';

const course: Course = {
  id: 'course-physics',
  externalIds: {},
  name: 'AP Physics 2',
  shortName: 'Physics'
};

function assignment(id: string, dueAt: string, overrides: Partial<Assignment> = {}): Assignment {
  return {
    id,
    courseId: course.id,
    title: id,
    dueAt,
    pointsPossible: 20,
    submitted: false,
    submissionState: 'not_submitted',
    source: 'canvas',
    ...overrides
  };
}

describe('priority engine', () => {
  const now = new Date('2026-08-10T09:00:00-07:00');

  it('ranks overdue work above work due tomorrow and later in the week', () => {
    const ranked = rankAssignments({
      assignments: [
        assignment('later', '2026-08-14T17:00:00-07:00'),
        assignment('tomorrow', '2026-08-11T08:00:00-07:00'),
        assignment('overdue', '2026-08-09T23:59:00-07:00')
      ],
      courses: [course],
      now
    });

    expect(ranked.map((item) => item.assignment.id)).toEqual(['overdue', 'tomorrow', 'later']);
    expect(ranked[0].explanation).toContain('Overdue');
    expect(ranked[1].explanation).toContain('Due within 24 hours');
  });

  it('lowers submitted work even when it is due soon', () => {
    const ranked = rankAssignments({
      assignments: [
        assignment('submitted', '2026-08-10T12:00:00-07:00', {
          submitted: true,
          submissionState: 'submitted'
        }),
        assignment('open', '2026-08-11T08:00:00-07:00')
      ],
      courses: [course],
      now
    });

    expect(ranked[0].assignment.id).toBe('open');
    expect(ranked[1].reasons.some((reason) => reason.code === 'submitted')).toBe(true);
  });

  it('raises a missing assignment and returns human-readable reasons', () => {
    const missing = assignment('missing', '2026-08-14T17:00:00-07:00');
    const ordinary = assignment('ordinary', '2026-08-14T16:00:00-07:00');
    const ranked = rankAssignments({
      assignments: [ordinary, missing],
      courses: [course],
      now,
      missingAssignmentIds: new Set([missing.id])
    });

    expect(ranked[0].assignment.id).toBe('missing');
    expect(ranked[0].explanation).toContain('Marked missing');
    expect(ranked[0].explanation).not.toContain('Priority Score');
  });
});
