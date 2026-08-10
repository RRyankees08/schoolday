import type {
  Assignment,
  CalendarEvent,
  Course,
  CourseGrade,
  GradebookAssignment,
  GradeSnapshot,
  Period,
  PeriodState,
  SchoolDay,
  Submission
} from '$lib/models';

export interface CanvasProvider {
  getCourses(): Promise<Course[]>;
  getAssignments(): Promise<Assignment[]>;
  getSubmissions(): Promise<Submission[]>;
  getCalendarEvents(): Promise<CalendarEvent[]>;
}

export interface GradebookProvider {
  getCourses(): Promise<Course[]>;
  getCourseGrades(): Promise<CourseGrade[]>;
  getGradebookAssignments(): Promise<GradebookAssignment[]>;
  getSnapshot(): Promise<GradeSnapshot>;
}

export interface ScheduleProvider {
  getSchoolDay(date: Date): Promise<SchoolDay>;
  getPeriods(date: Date): Promise<Period[]>;
  getCurrentPeriod(date: Date): Promise<PeriodState | null>;
  getNextPeriod(date: Date): Promise<PeriodState | null>;
}
