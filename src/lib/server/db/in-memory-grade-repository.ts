import type {
  CanvasSnapshot,
  GradeChange,
  GradeSnapshot,
  StudentVueSnapshot,
  SyncRun
} from '$lib/models';
import type { SchoolDayRepository, StoredCourseMapping } from './repositories';

export class InMemoryGradeRepository implements SchoolDayRepository {
  private snapshots: GradeSnapshot[] = [];
  private changes = new Map<string, GradeChange>();
  private canvasSnapshot: CanvasSnapshot | null = null;
  private studentVueSnapshot: StudentVueSnapshot | null = null;
  private syncRuns = new Map<string, SyncRun>();
  private courseMappings = new Map<string, StoredCourseMapping>();

  async getLatestSnapshot(): Promise<GradeSnapshot | null> {
    return this.snapshots.at(-1) ?? null;
  }

  async saveSnapshot(snapshot: GradeSnapshot): Promise<void> {
    const latest = this.snapshots.at(-1);
    if (latest?.capturedAt === snapshot.capturedAt) {
      this.snapshots[this.snapshots.length - 1] = structuredClone(snapshot);
      return;
    }
    this.snapshots.push(structuredClone(snapshot));
  }

  async appendGradeChanges(changes: readonly GradeChange[]): Promise<number> {
    let inserted = 0;
    for (const change of changes) {
      if (this.changes.has(change.id)) continue;
      this.changes.set(change.id, structuredClone(change));
      inserted += 1;
    }
    return inserted;
  }

  async listGradeChanges(limit = 10): Promise<GradeChange[]> {
    return [...this.changes.values()]
      .sort(
        (left, right) =>
          right.detectedAt.localeCompare(left.detectedAt) || left.id.localeCompare(right.id)
      )
      .slice(0, limit);
  }

  async getLatestCanvasSnapshot(): Promise<CanvasSnapshot | null> {
    return this.canvasSnapshot ? structuredClone(this.canvasSnapshot) : null;
  }

  async saveCanvasSnapshot(snapshot: CanvasSnapshot): Promise<void> {
    this.canvasSnapshot = structuredClone(snapshot);
  }

  async getLatestStudentVueSnapshot(): Promise<StudentVueSnapshot | null> {
    return this.studentVueSnapshot ? structuredClone(this.studentVueSnapshot) : null;
  }

  async saveStudentVueSnapshot(snapshot: StudentVueSnapshot): Promise<void> {
    this.studentVueSnapshot = structuredClone(snapshot);
  }

  async saveSyncRun(run: SyncRun): Promise<void> {
    this.syncRuns.set(run.id, structuredClone(run));
  }

  async listCourseMappings(): Promise<StoredCourseMapping[]> {
    return structuredClone([...this.courseMappings.values()]);
  }

  async saveCourseMappings(
    courses: readonly import('$lib/models').Course[],
    matchMethod: StoredCourseMapping['matchMethod'] = 'automatic',
    confidence = 1
  ): Promise<void> {
    for (const course of courses) {
      const previous = this.courseMappings.get(course.id);
      this.courseMappings.set(course.id, {
        schoolDayCourseId: course.id,
        canvasCourseId: course.externalIds.canvas ?? previous?.canvasCourseId,
        studentVueCourseId: course.externalIds.studentVue ?? previous?.studentVueCourseId,
        bellLogicPeriodId: course.externalIds.bellLogic ?? previous?.bellLogicPeriodId,
        matchMethod: previous?.matchMethod === 'manual' ? 'manual' : matchMethod,
        confidence: previous?.matchMethod === 'manual' ? previous.confidence : confidence
      });
    }
  }
}
