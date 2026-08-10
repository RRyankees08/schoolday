import type { Course } from './course';

export type SubmissionState =
  'not_submitted' | 'submitted' | 'late' | 'missing' | 'graded' | 'unknown';

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  dueAt: string | null;
  pointsPossible?: number;
  submitted: boolean;
  submissionState: SubmissionState;
  source: 'canvas';
  externalUrl?: string;
}

export type AssignmentReconciliationState =
  'not_submitted' | 'awaiting_grade' | 'complete' | 'missing' | 'excused' | 'possible_mismatch';

export interface AssignmentReconciliation {
  state: AssignmentReconciliationState;
  label: string;
  gradebookAssignmentId?: string;
  pointsEarned?: number;
  pointsPossible?: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  submittedAt?: string;
  state: SubmissionState;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  courseId?: string;
  externalUrl?: string;
}

export type PriorityReasonCode =
  | 'overdue'
  | 'due_within_12_hours'
  | 'due_within_24_hours'
  | 'due_within_48_hours'
  | 'missing'
  | 'high_points'
  | 'not_submitted'
  | 'todays_course'
  | 'submitted'
  | 'excused';

export interface PriorityReason {
  code: PriorityReasonCode;
  label: string;
  weight: number;
}

export interface RankedAssignment {
  assignment: Assignment;
  course: Course;
  reasons: PriorityReason[];
  explanation: string;
  score: number;
}
