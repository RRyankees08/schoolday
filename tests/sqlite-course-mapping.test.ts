import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SQLiteGradeRepository } from '$lib/server/db/sqlite-grade-repository';

describe('SQLite course mappings', () => {
  it('persists all provider IDs across restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'schoolday-mapping-'));
    const path = join(directory, 'schoolday.sqlite');
    try {
      const repository = new SQLiteGradeRepository(path);
      await repository.saveCourseMappings([
        {
          id: 'course-engineering',
          name: 'Engineering',
          externalIds: {
            canvas: 'canvas-2',
            studentVue: 'vue-4',
            bellLogic: 'period-6'
          }
        }
      ]);
      repository.close();

      const reopened = new SQLiteGradeRepository(path);
      expect(await reopened.listCourseMappings()).toEqual([
        {
          schoolDayCourseId: 'course-engineering',
          canvasCourseId: 'canvas-2',
          studentVueCourseId: 'vue-4',
          bellLogicPeriodId: 'period-6',
          matchMethod: 'automatic',
          confidence: 1
        }
      ]);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
