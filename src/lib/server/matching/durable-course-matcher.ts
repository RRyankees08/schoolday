import type { Course, CourseMatchResult, Period } from '$lib/models';
import type { CourseMappingRepository } from '$lib/server/db/repositories';
import { matchCourses } from './course-matcher';

function explicitMappingsFor(
  mappings: Awaited<ReturnType<CourseMappingRepository['listCourseMappings']>>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const mapping of mappings) {
    for (const externalId of [
      mapping.canvasCourseId,
      mapping.studentVueCourseId,
      mapping.bellLogicPeriodId
    ]) {
      if (externalId) result[externalId] = mapping.schoolDayCourseId;
    }
  }
  return result;
}

/** Matches provider courses while retaining stable IDs learned on earlier refreshes. */
export async function matchAndPersistCourses(
  providerCourseGroups: readonly (readonly Course[])[],
  repository: CourseMappingRepository
): Promise<CourseMatchResult> {
  const saved = await repository.listCourseMappings();
  const result = matchCourses(providerCourseGroups, explicitMappingsFor(saved));
  await repository.saveCourseMappings(result.courses, 'automatic', 1);
  return result;
}

/** Records Bell-Logic period IDs after periods have been matched to canonical courses. */
export async function persistBellLogicPeriodMappings(
  courses: readonly Course[],
  periods: readonly Period[],
  repository: CourseMappingRepository
): Promise<void> {
  const periodIdByCourse = new Map(
    periods.flatMap((period) => (period.courseId ? [[period.courseId, period.id] as const] : []))
  );
  const coursesWithPeriods = courses
    .filter((course) => periodIdByCourse.has(course.id))
    .map((course) => ({
      ...course,
      externalIds: { ...course.externalIds, bellLogic: periodIdByCourse.get(course.id) }
    }));
  if (coursesWithPeriods.length > 0) {
    await repository.saveCourseMappings(coursesWithPeriods, 'automatic', 1);
  }
}
