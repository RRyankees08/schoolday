import type { Assignment, AssignmentReconciliation, GradebookAssignment } from '$lib/models';
import { normalizeAssignmentTitle } from './assignment-title';

function scoreLabel(assignment: GradebookAssignment): string {
  if (assignment.pointsEarned !== undefined && assignment.pointsPossible !== undefined) {
    return `Complete · ${assignment.pointsEarned} / ${assignment.pointsPossible}`;
  }
  if (assignment.percentage !== undefined) return `Complete · ${assignment.percentage}%`;
  return 'Complete';
}

function resultForMatch(assignment: GradebookAssignment): AssignmentReconciliation {
  const details = {
    gradebookAssignmentId: assignment.id,
    pointsEarned: assignment.pointsEarned,
    pointsPossible: assignment.pointsPossible
  };

  if (assignment.excused) return { state: 'excused', label: 'Excused', ...details };
  if (assignment.missing) return { state: 'missing', label: 'Missing', ...details };
  if (assignment.pointsEarned !== undefined || assignment.percentage !== undefined) {
    return { state: 'complete', label: scoreLabel(assignment), ...details };
  }
  return { state: 'awaiting_grade', label: 'Submitted · awaiting grade', ...details };
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeAssignmentTitle(title)
      .split(' ')
      .filter((token) => token.length > 2)
  );
}

function looksRelated(left: string, right: string): boolean {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

/**
 * Reconciles Canvas work with the normalized StudentVUE gradebook. Only exact
 * normalized titles are merged. Similar titles are flagged for review instead
 * of risking an incorrect grade or missing-state attribution.
 */
export function reconcileAssignments(
  assignments: readonly Assignment[],
  gradebookAssignments: readonly GradebookAssignment[]
): Map<string, AssignmentReconciliation> {
  const gradebookByCourse = new Map<string, GradebookAssignment[]>();
  for (const gradebookAssignment of gradebookAssignments) {
    const courseAssignments = gradebookByCourse.get(gradebookAssignment.courseId) ?? [];
    courseAssignments.push(gradebookAssignment);
    gradebookByCourse.set(gradebookAssignment.courseId, courseAssignments);
  }

  return new Map(
    assignments.map((assignment) => {
      const candidates = gradebookByCourse.get(assignment.courseId) ?? [];
      const normalizedTitle = normalizeAssignmentTitle(assignment.title);
      const exact = candidates.find(
        (candidate) => normalizeAssignmentTitle(candidate.title) === normalizedTitle
      );
      if (exact) return [assignment.id, resultForMatch(exact)];

      if (candidates.some((candidate) => looksRelated(assignment.title, candidate.title))) {
        return [
          assignment.id,
          { state: 'possible_mismatch', label: 'Possible gradebook mismatch' }
        ];
      }

      return [
        assignment.id,
        assignment.submitted
          ? { state: 'awaiting_grade', label: 'Submitted · awaiting grade' }
          : { state: 'not_submitted', label: 'Not submitted' }
      ];
    })
  );
}
