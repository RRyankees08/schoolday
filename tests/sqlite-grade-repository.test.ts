import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { CanvasSnapshot, GradeChange, GradeSnapshot } from '$lib/models';
import { SQLiteGradeRepository } from '$lib/server/db/sqlite-grade-repository';

const temporaryDirectories: string[] = [];

function createRepository(): { path: string; repository: SQLiteGradeRepository } {
  const directory = mkdtempSync(join(tmpdir(), 'schoolday-sqlite-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'schoolday.sqlite');
  return { path, repository: new SQLiteGradeRepository(path) };
}

const snapshot: GradeSnapshot = {
  capturedAt: '2026-08-10T16:00:00.000Z',
  courseGrades: [
    {
      courseId: 'math',
      percentage: 91.5,
      letterGrade: 'A',
      capturedAt: '2026-08-10T16:00:00.000Z'
    }
  ],
  assignments: [
    {
      id: 'quiz-1',
      courseId: 'math',
      title: 'Quiz 1',
      pointsEarned: 18,
      pointsPossible: 20,
      missing: false,
      capturedAt: '2026-08-10T16:00:00.000Z'
    }
  ]
};

const change: GradeChange = {
  id: 'change-1',
  courseId: 'math',
  detectedAt: '2026-08-10T16:00:00.000Z',
  type: 'course_grade_changed',
  previousValue: 89,
  currentValue: 91.5,
  acknowledged: false
};

const canvasSnapshot: CanvasSnapshot = {
  capturedAt: '2026-08-10T16:05:00.000Z',
  courses: [
    {
      id: 'canvas-course-1',
      externalIds: { canvas: 'canvas-course-1' },
      name: 'AP Calculus BC',
      shortName: 'Calculus'
    }
  ],
  assignments: [
    {
      id: 'canvas-assignment-1',
      courseId: 'canvas-course-1',
      title: 'Limits Review',
      dueAt: '2026-08-11T06:59:00.000Z',
      pointsPossible: 20,
      submitted: true,
      submissionState: 'submitted',
      source: 'canvas',
      externalUrl: 'https://canvas.example.edu/assignments/1'
    }
  ]
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLiteGradeRepository', () => {
  it('persists snapshots and changes across repository restarts', async () => {
    const { path, repository } = createRepository();
    await repository.saveSnapshot(snapshot);
    expect(await repository.appendGradeChanges([change])).toBe(1);
    repository.close();

    const reopened = new SQLiteGradeRepository(path);
    expect(await reopened.getLatestSnapshot()).toEqual({
      ...snapshot,
      courseGrades: [
        {
          ...snapshot.courseGrades[0],
          rawDisplay: undefined,
          gradingPeriod: undefined
        }
      ],
      assignments: [
        {
          ...snapshot.assignments[0],
          percentage: undefined,
          excused: false,
          gradedAt: undefined
        }
      ]
    });
    expect(await reopened.listGradeChanges()).toEqual([change]);
    expect(await reopened.appendGradeChanges([change])).toBe(0);
    reopened.close();
  });

  it('replaces all rows when the same captured timestamp is saved again', async () => {
    const { repository } = createRepository();
    await repository.saveSnapshot(snapshot);
    await repository.saveSnapshot({ ...snapshot, courseGrades: [], assignments: [] });

    expect(await repository.getLatestSnapshot()).toEqual({
      capturedAt: snapshot.capturedAt,
      courseGrades: [],
      assignments: []
    });
    repository.close();
  });

  it('persists the latest Canvas briefing snapshot across restarts', async () => {
    const { path, repository } = createRepository();
    await repository.saveCanvasSnapshot(canvasSnapshot);
    repository.close();

    const reopened = new SQLiteGradeRepository(path);
    expect(await reopened.getLatestCanvasSnapshot()).toEqual(canvasSnapshot);
    reopened.close();
  });

  it('persists the last-known-good StudentVUE briefing snapshot across restarts', async () => {
    const { path, repository } = createRepository();
    const studentVueSnapshot = {
      capturedAt: snapshot.capturedAt,
      courses: [
        {
          id: 'studentvue:math',
          externalIds: { studentVue: 'studentvue:math' },
          name: 'Algebra II'
        }
      ],
      snapshot
    };
    await repository.saveStudentVueSnapshot(studentVueSnapshot);
    repository.close();

    const reopened = new SQLiteGradeRepository(path);
    expect(await reopened.getLatestStudentVueSnapshot()).toEqual(studentVueSnapshot);
    reopened.close();
  });

  it('removes grade activity created from serialized StudentVUE link cells', async () => {
    const { path, repository } = createRepository();
    const corruptTitle = JSON.stringify({
      href: 'javascript:',
      hrefAttributes: 'data-focus={"LoadParams":{"ControlName":"AssignmentDetail6"}}',
      value: 'Design Brief',
      dataType: 'LinkColumn'
    });
    const corruptSnapshot: GradeSnapshot = {
      ...snapshot,
      assignments: [
        {
          ...snapshot.assignments[0],
          title: corruptTitle,
          pointsEarned: 6,
          pointsPossible: 1,
          percentage: 600
        }
      ]
    };
    await repository.saveSnapshot(corruptSnapshot);
    await repository.saveStudentVueSnapshot({
      capturedAt: corruptSnapshot.capturedAt,
      courses: [],
      snapshot: corruptSnapshot
    });
    await repository.appendGradeChanges([
      {
        id: 'corrupt-assignment-grade',
        courseId: 'math',
        detectedAt: corruptSnapshot.capturedAt,
        type: 'assignment_graded',
        previousValue: null,
        currentValue: '6 / 1',
        assignmentId: 'quiz-1',
        assignmentTitle: corruptTitle,
        acknowledged: false
      }
    ]);
    repository.close();

    const database = new DatabaseSync(path);
    database.exec('PRAGMA user_version = 2');
    database.close();

    const reopened = new SQLiteGradeRepository(path);
    expect((await reopened.getLatestSnapshot())?.assignments).toEqual([]);
    expect(await reopened.getLatestStudentVueSnapshot()).toBeNull();
    expect(await reopened.listGradeChanges()).toEqual([]);
    reopened.close();
  });

  it('records sync progress without requiring a background scheduler', async () => {
    const { repository } = createRepository();
    await repository.saveSyncRun({
      id: 'canvas-sync-1',
      provider: 'canvas',
      startedAt: canvasSnapshot.capturedAt,
      completedAt: canvasSnapshot.capturedAt,
      status: 'success',
      recordsProcessed: 2
    });
    repository.close();
  });
});
