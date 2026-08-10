import type { GradeSnapshot } from '$lib/models';
import type { GradeRepository } from '$lib/server/db/repositories';
import { detectGradeChanges } from '$lib/server/grade-changes/detect-grade-changes';

export interface GradebookSyncResult {
  snapshot: GradeSnapshot;
  changesDetected: number;
  changesPersisted: number;
}

export async function syncGradebookSnapshot(
  repository: GradeRepository,
  incoming: GradeSnapshot
): Promise<GradebookSyncResult> {
  const previous = await repository.getLatestSnapshot();
  const changes = detectGradeChanges(previous, incoming);
  const changesPersisted = await repository.appendGradeChanges(changes);
  await repository.saveSnapshot(incoming);
  return {
    snapshot: incoming,
    changesDetected: changes.length,
    changesPersisted
  };
}
