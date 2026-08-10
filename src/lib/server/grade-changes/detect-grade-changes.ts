import type {
  CourseGrade,
  GradeChange,
  GradeChangeValue,
  GradeSnapshot,
  GradebookAssignment
} from '$lib/models';

function gradeValue(assignment: GradebookAssignment): string | null {
  if (assignment.pointsEarned === undefined && assignment.percentage === undefined) return null;
  if (assignment.pointsEarned !== undefined && assignment.pointsPossible !== undefined) {
    return `${assignment.pointsEarned} / ${assignment.pointsPossible}`;
  }
  return assignment.percentage === undefined ? null : `${assignment.percentage}%`;
}

function stablePart(value: GradeChangeValue | undefined): string {
  return encodeURIComponent(value === undefined ? 'undefined' : String(value));
}

function eventId(change: Omit<GradeChange, 'id'>): string {
  return [
    'grade-change',
    change.detectedAt,
    change.courseId,
    change.assignmentId ?? 'course',
    change.type,
    stablePart(change.previousValue),
    stablePart(change.currentValue)
  ].join(':');
}

function createChange(change: Omit<GradeChange, 'id'>): GradeChange {
  return { ...change, id: eventId(change) };
}

function numberChanged(previous: number | undefined, current: number | undefined): boolean {
  return previous !== current;
}

function courseGradeChanges(
  previous: readonly CourseGrade[],
  current: readonly CourseGrade[],
  detectedAt: string
): GradeChange[] {
  const previousByCourse = new Map(previous.map((grade) => [grade.courseId, grade] as const));

  return current.flatMap((grade) => {
    const oldGrade = previousByCourse.get(grade.courseId);
    if (!oldGrade || !numberChanged(oldGrade.percentage, grade.percentage)) return [];

    return [
      createChange({
        courseId: grade.courseId,
        detectedAt,
        type: 'course_grade_changed',
        previousValue: oldGrade.percentage ?? null,
        currentValue: grade.percentage ?? null,
        acknowledged: false
      })
    ];
  });
}

function scoreChanged(previous: GradebookAssignment, current: GradebookAssignment): boolean {
  return (
    numberChanged(previous.pointsEarned, current.pointsEarned) ||
    numberChanged(previous.pointsPossible, current.pointsPossible) ||
    numberChanged(previous.percentage, current.percentage)
  );
}

function assignmentChanges(
  previous: readonly GradebookAssignment[],
  current: readonly GradebookAssignment[],
  detectedAt: string
): GradeChange[] {
  const previousById = new Map(previous.map((assignment) => [assignment.id, assignment] as const));
  const changes: GradeChange[] = [];

  for (const assignment of current) {
    const oldAssignment = previousById.get(assignment.id);
    const currentScore = gradeValue(assignment);

    if (!oldAssignment) {
      if (currentScore !== null) {
        changes.push(
          createChange({
            courseId: assignment.courseId,
            detectedAt,
            type: 'assignment_graded',
            previousValue: null,
            currentValue: currentScore,
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            acknowledged: false
          })
        );
      }
      continue;
    }

    const previousScore = gradeValue(oldAssignment);
    if (scoreChanged(oldAssignment, assignment)) {
      changes.push(
        createChange({
          courseId: assignment.courseId,
          detectedAt,
          type:
            previousScore === null && currentScore !== null
              ? 'assignment_graded'
              : 'assignment_score_changed',
          previousValue: previousScore,
          currentValue: currentScore,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          acknowledged: false
        })
      );
    }

    const wasMissing = oldAssignment.missing ?? false;
    const isMissing = assignment.missing ?? false;
    if (wasMissing !== isMissing) {
      changes.push(
        createChange({
          courseId: assignment.courseId,
          detectedAt,
          type: 'missing_status_changed',
          previousValue: wasMissing,
          currentValue: isMissing,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          acknowledged: false
        })
      );
    }
  }

  return changes;
}

export function detectGradeChanges(
  previous: GradeSnapshot | null,
  current: GradeSnapshot
): GradeChange[] {
  if (!previous) return [];
  return [
    ...courseGradeChanges(previous.courseGrades, current.courseGrades, current.capturedAt),
    ...assignmentChanges(previous.assignments, current.assignments, current.capturedAt)
  ];
}
