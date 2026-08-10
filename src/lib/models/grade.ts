export interface CourseGrade {
  courseId: string;
  percentage?: number;
  letterGrade?: string;
  rawDisplay?: string;
  gradingPeriod?: string;
  capturedAt: string;
}

export interface GradebookAssignment {
  id: string;
  courseId: string;
  title: string;
  pointsEarned?: number;
  pointsPossible?: number;
  percentage?: number;
  missing?: boolean;
  excused?: boolean;
  gradedAt?: string;
  capturedAt: string;
}

export type GradeChangeType =
  | 'course_grade_changed'
  | 'assignment_graded'
  | 'assignment_score_changed'
  | 'missing_status_changed';

export type GradeChangeValue = string | number | boolean | null;

export interface GradeChange {
  id: string;
  courseId: string;
  detectedAt: string;
  type: GradeChangeType;
  previousValue?: GradeChangeValue;
  currentValue?: GradeChangeValue;
  assignmentId?: string;
  assignmentTitle?: string;
  acknowledged: boolean;
}

export interface GradeSnapshot {
  capturedAt: string;
  courseGrades: CourseGrade[];
  assignments: GradebookAssignment[];
}

/** Last-known-good raw StudentVUE response, kept locally for the daily briefing. */
export interface StudentVueSnapshot {
  capturedAt: string;
  courses: import('./course').Course[];
  snapshot: GradeSnapshot;
}

export interface CourseGradeSummary extends CourseGrade {
  course: Course;
  previousPercentage?: number;
  movement?: number;
}

import type { Course } from './course';
