import type { Period, PeriodState, ScheduleState } from '$lib/models';

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function toPeriodState(period: Period, at: Date): PeriodState {
  const start = new Date(period.startAt);
  const end = new Date(period.endAt);
  const duration = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(at.getTime() - start.getTime(), 0), duration);

  return {
    period,
    secondsRemaining: secondsBetween(at, end),
    progressPercent: duration > 0 ? Math.round((elapsed / duration) * 1000) / 10 : 0
  };
}

export function calculateScheduleState(
  periods: readonly Period[],
  at: Date,
  isSchoolDay = true
): ScheduleState {
  const sorted = [...periods].sort(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime()
  );
  const now = at.getTime();

  if (!isSchoolDay || sorted.length === 0) {
    return {
      phase: 'no_school',
      currentPeriod: null,
      nextPeriod: null,
      secondsUntilNext: null,
      periodStates: sorted.map((period) => ({ period, state: 'upcoming' }))
    };
  }

  const current = sorted.find(
    (period) => new Date(period.startAt).getTime() <= now && now < new Date(period.endAt).getTime()
  );
  const next = sorted.find((period) => new Date(period.startAt).getTime() > now);
  const firstStart = new Date(sorted[0].startAt).getTime();
  const lastEnd = new Date(sorted[sorted.length - 1].endAt).getTime();

  let phase: ScheduleState['phase'];
  if (current) phase = 'in_period';
  else if (now < firstStart) phase = 'before_school';
  else if (now >= lastEnd) phase = 'after_school';
  else phase = 'passing_period';

  return {
    phase,
    currentPeriod: current ? toPeriodState(current, at) : null,
    nextPeriod: next ? toPeriodState(next, new Date(next.startAt)) : null,
    secondsUntilNext: next ? secondsBetween(at, new Date(next.startAt)) : null,
    periodStates: sorted.map((period) => {
      const start = new Date(period.startAt).getTime();
      const end = new Date(period.endAt).getTime();
      const state = start <= now && now < end ? 'current' : end <= now ? 'completed' : 'upcoming';
      return { period, state };
    })
  };
}
