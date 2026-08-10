import { describe, expect, it } from 'vitest';
import type { Course } from '$lib/models';
import { InMemoryGradeRepository } from '$lib/server/db/in-memory-grade-repository';
import {
  matchAndPersistCourses,
  persistBellLogicPeriodMappings
} from '$lib/server/matching/durable-course-matcher';

function course(id: string, name: string, provider: keyof Course['externalIds']): Course {
  return { id, name, externalIds: { [provider]: id } };
}

describe('matchAndPersistCourses', () => {
  it('reuses learned provider IDs when a course name later changes', async () => {
    const repository = new InMemoryGradeRepository();
    const first = await matchAndPersistCourses(
      [
        [course('canvas-42', 'AP Calculus BC', 'canvas')],
        [course('vue-7', 'AP Calculus BC', 'studentVue')]
      ],
      repository
    );
    const canonicalId = first.courses[0].id;

    const second = await matchAndPersistCourses(
      [
        [course('canvas-42', 'Calculus BC - Period 3', 'canvas')],
        [course('vue-7', 'Advanced Placement Calculus', 'studentVue')]
      ],
      repository
    );

    expect(second.courses).toHaveLength(1);
    expect(second.courses[0].id).toBe(canonicalId);
    expect(Object.fromEntries(second.sourceCourseIdToSchoolDayId)).toEqual({
      'canvas-42': canonicalId,
      'vue-7': canonicalId
    });
    expect(await repository.listCourseMappings()).toEqual([
      expect.objectContaining({
        schoolDayCourseId: canonicalId,
        canvasCourseId: 'canvas-42',
        studentVueCourseId: 'vue-7',
        matchMethod: 'automatic'
      })
    ]);
  });

  it('does not overwrite the method of an existing manual mapping', async () => {
    const repository = new InMemoryGradeRepository();
    const canonical: Course = {
      id: 'course-physics',
      name: 'Physics',
      externalIds: { canvas: 'canvas-1', studentVue: 'vue-1' }
    };
    await repository.saveCourseMappings([canonical], 'manual', 0.8);
    await matchAndPersistCourses([[course('canvas-1', 'Renamed Physics', 'canvas')]], repository);

    expect(await repository.listCourseMappings()).toEqual([
      expect.objectContaining({ matchMethod: 'manual', confidence: 0.8 })
    ]);
  });

  it('adds the matched Bell-Logic period ID without losing provider course IDs', async () => {
    const repository = new InMemoryGradeRepository();
    const matched = await matchAndPersistCourses(
      [[course('canvas-42', 'AP Calculus BC', 'canvas')]],
      repository
    );
    await persistBellLogicPeriodMappings(
      matched.courses,
      [
        {
          id: 'period-3',
          name: 'AP Calculus BC',
          startAt: '2026-08-10T09:00:00.000Z',
          endAt: '2026-08-10T10:00:00.000Z',
          courseId: matched.courses[0].id
        }
      ],
      repository
    );

    expect(await repository.listCourseMappings()).toEqual([
      expect.objectContaining({ canvasCourseId: 'canvas-42', bellLogicPeriodId: 'period-3' })
    ]);
  });
});
