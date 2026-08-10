import { describe, expect, it } from 'vitest';
import type { Course } from '$lib/models';
import { matchCourses, normalizeCourseName } from '$lib/server/matching/course-matcher';

function course(id: string, name: string, source: 'canvas' | 'studentVue'): Course {
  return { id, name, externalIds: { [source]: id } };
}

describe('course matching foundation', () => {
  it('matches exact normalized names across providers without leaking source IDs', () => {
    const result = matchCourses([
      [course('canvas:1', 'AP Physics 2', 'canvas')],
      [course('studentvue:A', 'AP PHYSICS 2', 'studentVue')]
    ]);

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].externalIds).toEqual({
      canvas: 'canvas:1',
      studentVue: 'studentvue:A'
    });
    expect(result.sourceCourseIdToSchoolDayId.get('canvas:1')).toBe(
      result.sourceCourseIdToSchoolDayId.get('studentvue:A')
    );
  });

  it('normalizes punctuation and optional section suffixes conservatively', () => {
    expect(normalizeCourseName('AP Calculus BC — Period 1B')).toBe('ap calculus bc');
  });

  it('honors saved explicit mappings before name matching', () => {
    const result = matchCourses([[course('canvas:1', 'Engineering', 'canvas')]], {
      'canvas:1': 'course-engineering-fabrication'
    });
    expect(result.courses[0].id).toBe('course-engineering-fabrication');
  });
});
