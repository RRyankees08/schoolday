import type { Assignment, AssignmentReconciliation, RankedAssignment } from './assignment';
import type { Course } from './course';
import type { CourseGradeSummary, GradeChange } from './grade';
import type { Period, ScheduleState, SchoolDay } from './schedule';
import type { ProviderSyncStatus } from './sync';

export interface DashboardData {
  generatedAt: string;
  displayName: string;
  schoolDay: SchoolDay;
  scheduleState: ScheduleState;
  priorityAssignments: RankedAssignment[];
  upcomingAssignments: Array<
    Assignment & { course: Course; reconciliation: AssignmentReconciliation }
  >;
  grades: CourseGradeSummary[];
  gradeChanges: GradeChange[];
  courses: Course[];
  schedule: Period[];
  syncStatus: ProviderSyncStatus[];
}
