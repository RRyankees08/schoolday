import type { Assignment } from './assignment';
import type { Course } from './course';

export type ProviderName = 'canvas' | 'studentVue' | 'bellLogic';
export type SyncRunStatus = 'started' | 'success' | 'failed';

export interface SyncRun {
  id: string;
  provider: ProviderName;
  startedAt: string;
  completedAt?: string;
  status: SyncRunStatus;
  recordsProcessed?: number;
  errorMessage?: string;
}

export interface ProviderSyncStatus {
  provider: ProviderName;
  status: 'live' | 'fixture' | 'error';
  lastUpdatedAt: string;
  label: string;
}

export interface CanvasSnapshot {
  capturedAt: string;
  courses: Course[];
  assignments: Assignment[];
}
