export interface Period {
  id: string;
  name: string;
  courseId?: string;
  startAt: string;
  endAt: string;
}

export interface PeriodState {
  period: Period;
  secondsRemaining: number;
  progressPercent: number;
}

export interface SchoolDay {
  date: string;
  isSchoolDay: boolean;
  scheduleName?: string;
  dayType?: string;
}

export type SchedulePhase =
  'no_school' | 'before_school' | 'in_period' | 'passing_period' | 'after_school';

export type PeriodDisplayState = 'completed' | 'current' | 'upcoming';

export interface ScheduleState {
  phase: SchedulePhase;
  currentPeriod: PeriodState | null;
  nextPeriod: PeriodState | null;
  secondsUntilNext: number | null;
  periodStates: Array<{ period: Period; state: PeriodDisplayState }>;
}
