import type { Assignment, Course, PriorityReason, RankedAssignment } from '$lib/models';

export interface PriorityWeights {
  overdue: number;
  dueWithin12Hours: number;
  dueWithin24Hours: number;
  dueWithin48Hours: number;
  missing: number;
  highPoints: number;
  notSubmitted: number;
  todaysCourse: number;
  submitted: number;
  excused: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: Readonly<PriorityWeights> = {
  overdue: 100,
  dueWithin12Hours: 80,
  dueWithin24Hours: 60,
  dueWithin48Hours: 40,
  missing: 30,
  highPoints: 20,
  notSubmitted: 15,
  todaysCourse: 10,
  submitted: -50,
  excused: -100
};

export interface RankAssignmentsInput {
  assignments: readonly Assignment[];
  courses: readonly Course[];
  now: Date;
  todayCourseIds?: ReadonlySet<string>;
  missingAssignmentIds?: ReadonlySet<string>;
  excusedAssignmentIds?: ReadonlySet<string>;
  weights?: Readonly<PriorityWeights>;
}

function dueReason(
  assignment: Assignment,
  now: Date,
  weights: Readonly<PriorityWeights>
): PriorityReason | null {
  if (!assignment.dueAt || assignment.submitted) return null;
  const hours = (new Date(assignment.dueAt).getTime() - now.getTime()) / 3_600_000;

  if (hours < 0) return { code: 'overdue', label: 'Overdue', weight: weights.overdue };
  if (hours <= 12)
    return {
      code: 'due_within_12_hours',
      label: 'Due within 12 hours',
      weight: weights.dueWithin12Hours
    };
  if (hours <= 24)
    return {
      code: 'due_within_24_hours',
      label: 'Due within 24 hours',
      weight: weights.dueWithin24Hours
    };
  if (hours <= 48)
    return {
      code: 'due_within_48_hours',
      label: 'Due within 48 hours',
      weight: weights.dueWithin48Hours
    };
  return null;
}

function addReason(
  reasons: PriorityReason[],
  reason: PriorityReason | null | false | undefined
): void {
  if (reason) reasons.push(reason);
}

function explanationFor(reasons: readonly PriorityReason[]): string {
  const userFacing = reasons.filter(
    (reason) => reason.code !== 'todays_course' && reason.code !== 'submitted'
  );
  return (userFacing.length > 0 ? userFacing : reasons)
    .slice(0, 3)
    .map((reason) => reason.label)
    .join(' · ');
}

export function rankAssignments(input: RankAssignmentsInput): RankedAssignment[] {
  const weights = input.weights ?? DEFAULT_PRIORITY_WEIGHTS;
  const coursesById = new Map(input.courses.map((course) => [course.id, course] as const));

  return input.assignments
    .map((assignment): RankedAssignment | null => {
      const course = coursesById.get(assignment.courseId);
      if (!course) return null;

      const reasons: PriorityReason[] = [];
      addReason(reasons, dueReason(assignment, input.now, weights));
      addReason(
        reasons,
        input.missingAssignmentIds?.has(assignment.id) && {
          code: 'missing',
          label: 'Marked missing',
          weight: weights.missing
        }
      );
      addReason(
        reasons,
        (assignment.pointsPossible ?? 0) >= 50 && {
          code: 'high_points',
          label: `${assignment.pointsPossible} points`,
          weight: weights.highPoints
        }
      );
      addReason(
        reasons,
        !assignment.submitted && {
          code: 'not_submitted',
          label: 'Not submitted',
          weight: weights.notSubmitted
        }
      );
      addReason(
        reasons,
        input.todayCourseIds?.has(assignment.courseId) && {
          code: 'todays_course',
          label: 'Class meets today',
          weight: weights.todaysCourse
        }
      );
      addReason(
        reasons,
        assignment.submitted && {
          code: 'submitted',
          label: 'Already submitted',
          weight: weights.submitted
        }
      );
      addReason(
        reasons,
        input.excusedAssignmentIds?.has(assignment.id) && {
          code: 'excused',
          label: 'Excused',
          weight: weights.excused
        }
      );

      return {
        assignment,
        course,
        reasons,
        explanation: explanationFor(reasons),
        score: reasons.reduce((total, reason) => total + reason.weight, 0)
      };
    })
    .filter((item): item is RankedAssignment => item !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftDue = left.assignment.dueAt ? new Date(left.assignment.dueAt).getTime() : Infinity;
      const rightDue = right.assignment.dueAt
        ? new Date(right.assignment.dueAt).getTime()
        : Infinity;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return left.assignment.title.localeCompare(right.assignment.title);
    });
}
