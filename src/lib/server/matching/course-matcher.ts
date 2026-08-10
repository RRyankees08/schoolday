import type {
  Assignment,
  Course,
  CourseGrade,
  CourseMatchResult,
  GradebookAssignment,
  Period
} from '$lib/models';

export function normalizeCourseName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(section|period)\s+[a-z0-9-]+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugifyCourseName(name: string): string {
  return normalizeCourseName(name).replace(/\s+/g, '-');
}

function mergeCourse(existing: Course, incoming: Course): Course {
  return {
    ...existing,
    externalIds: { ...existing.externalIds, ...incoming.externalIds },
    shortName: existing.shortName ?? incoming.shortName,
    period: existing.period ?? incoming.period,
    teacher: existing.teacher ?? incoming.teacher
  };
}

export function matchCourses(
  providerCourseGroups: readonly (readonly Course[])[],
  explicitMappings: Readonly<Record<string, string>> = {}
): CourseMatchResult {
  const coursesById = new Map<string, Course>();
  const canonicalIdByNormalizedName = new Map<string, string>();
  const sourceCourseIdToSchoolDayId = new Map<string, string>();

  for (const courses of providerCourseGroups) {
    for (const course of courses) {
      const normalizedName = normalizeCourseName(course.name);
      const explicitId = explicitMappings[course.id];
      const schoolDayId =
        explicitId ??
        canonicalIdByNormalizedName.get(normalizedName) ??
        `course-${slugifyCourseName(course.name)}`;

      canonicalIdByNormalizedName.set(normalizedName, schoolDayId);
      sourceCourseIdToSchoolDayId.set(course.id, schoolDayId);

      const canonicalCourse: Course = { ...course, id: schoolDayId };
      const existing = coursesById.get(schoolDayId);
      coursesById.set(
        schoolDayId,
        existing ? mergeCourse(existing, canonicalCourse) : canonicalCourse
      );
    }
  }

  return {
    courses: [...coursesById.values()],
    sourceCourseIdToSchoolDayId
  };
}

function mappedCourseId(sourceId: string, mapping: ReadonlyMap<string, string>): string {
  return mapping.get(sourceId) ?? sourceId;
}

export function remapAssignments(
  assignments: readonly Assignment[],
  mapping: ReadonlyMap<string, string>
): Assignment[] {
  return assignments.map((assignment) => ({
    ...assignment,
    courseId: mappedCourseId(assignment.courseId, mapping)
  }));
}

export function remapCourseGrades(
  grades: readonly CourseGrade[],
  mapping: ReadonlyMap<string, string>
): CourseGrade[] {
  return grades.map((grade) => ({
    ...grade,
    courseId: mappedCourseId(grade.courseId, mapping)
  }));
}

export function remapGradebookAssignments(
  assignments: readonly GradebookAssignment[],
  mapping: ReadonlyMap<string, string>
): GradebookAssignment[] {
  return assignments.map((assignment) => ({
    ...assignment,
    courseId: mappedCourseId(assignment.courseId, mapping)
  }));
}

export function matchPeriodsToCourses(
  periods: readonly Period[],
  courses: readonly Course[]
): Period[] {
  const courseIdByName = new Map(
    courses.map((course) => [normalizeCourseName(course.name), course.id] as const)
  );

  return periods.map((period) => ({
    ...period,
    courseId: courseIdByName.get(normalizeCourseName(period.name))
  }));
}
