import type { Course, CourseGrade, GradeSnapshot, GradebookAssignment } from '$lib/models';
import type { StudentVueGradebookFixture } from './schema';

export function normalizeStudentVueCourses(raw: StudentVueGradebookFixture): Course[] {
  return raw.courses.map((course) => ({
    id: `studentvue:${course.class_id}`,
    externalIds: { studentVue: course.class_id },
    name: course.course_title,
    period: course.period,
    teacher: course.teacher_name
  }));
}

export function normalizeStudentVueCourseGrades(raw: StudentVueGradebookFixture): CourseGrade[] {
  return raw.courses.map((course) => ({
    courseId: `studentvue:${course.class_id}`,
    percentage: course.grade.percentage ?? undefined,
    letterGrade: course.grade.letter ?? undefined,
    rawDisplay:
      course.grade.percentage === null
        ? (course.grade.letter ?? undefined)
        : `${course.grade.percentage.toFixed(1)}%`,
    gradingPeriod: raw.grading_period,
    capturedAt: raw.captured_at
  }));
}

export function normalizeStudentVueAssignments(
  raw: StudentVueGradebookFixture
): GradebookAssignment[] {
  return raw.courses.flatMap((course) =>
    course.assignments.map((assignment) => ({
      id: `studentvue:${assignment.item_id}`,
      courseId: `studentvue:${course.class_id}`,
      title: assignment.title,
      pointsEarned: assignment.points_earned ?? undefined,
      pointsPossible: assignment.points_possible ?? undefined,
      percentage: assignment.percentage ?? undefined,
      missing: assignment.is_missing,
      excused: assignment.is_excused,
      gradedAt: assignment.graded_at ?? undefined,
      capturedAt: raw.captured_at
    }))
  );
}

export function normalizeStudentVueSnapshot(raw: StudentVueGradebookFixture): GradeSnapshot {
  return {
    capturedAt: raw.captured_at,
    courseGrades: normalizeStudentVueCourseGrades(raw),
    assignments: normalizeStudentVueAssignments(raw)
  };
}
