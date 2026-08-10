import type {
  CanvasSnapshot,
  Course,
  GradeChange,
  GradeSnapshot,
  StudentVueSnapshot,
  SyncRun
} from '$lib/models';

export interface StoredCourseMapping {
  schoolDayCourseId: string;
  canvasCourseId?: string;
  studentVueCourseId?: string;
  bellLogicPeriodId?: string;
  matchMethod: 'automatic' | 'manual';
  confidence?: number;
}

export interface GradeSnapshotRepository {
  getLatestSnapshot(): Promise<GradeSnapshot | null>;
  saveSnapshot(snapshot: GradeSnapshot): Promise<void>;
}

export interface GradeChangeRepository {
  appendGradeChanges(changes: readonly GradeChange[]): Promise<number>;
  listGradeChanges(limit?: number): Promise<GradeChange[]>;
}

export interface GradeRepository extends GradeSnapshotRepository, GradeChangeRepository {}

export interface SyncRunRepository {
  saveSyncRun(run: SyncRun): Promise<void>;
}

export interface CanvasSnapshotRepository {
  getLatestCanvasSnapshot(): Promise<CanvasSnapshot | null>;
  saveCanvasSnapshot(snapshot: CanvasSnapshot): Promise<void>;
}

export interface StudentVueSnapshotRepository {
  getLatestStudentVueSnapshot(): Promise<StudentVueSnapshot | null>;
  saveStudentVueSnapshot(snapshot: StudentVueSnapshot): Promise<void>;
}

export interface CourseMappingRepository {
  listCourseMappings(): Promise<StoredCourseMapping[]>;
  saveCourseMappings(
    courses: readonly Course[],
    matchMethod?: StoredCourseMapping['matchMethod'],
    confidence?: number
  ): Promise<void>;
}

export interface SchoolDayRepository
  extends
    GradeRepository,
    CanvasSnapshotRepository,
    StudentVueSnapshotRepository,
    SyncRunRepository,
    CourseMappingRepository {}
