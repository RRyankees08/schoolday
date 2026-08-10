import { describe, expect, it } from 'vitest';
import type { Period } from '$lib/models';
import { MockBellLogicProvider } from '$lib/server/providers/mock/mock-belllogic-provider';
import { calculateScheduleState } from '$lib/server/schedule/calculate-schedule-state';

const periods: Period[] = [
  {
    id: 'period-1',
    name: 'AP Physics 2',
    startAt: '2026-08-10T08:15:00-07:00',
    endAt: '2026-08-10T09:47:00-07:00'
  },
  {
    id: 'period-2',
    name: 'Engineering Fabrication',
    startAt: '2026-08-10T09:52:00-07:00',
    endAt: '2026-08-10T11:24:00-07:00'
  }
];

describe('schedule state', () => {
  it('reports before school and points to the first period', () => {
    const state = calculateScheduleState(periods, new Date('2026-08-10T07:45:00-07:00'));
    expect(state.phase).toBe('before_school');
    expect(state.currentPeriod).toBeNull();
    expect(state.nextPeriod?.period.id).toBe('period-1');
    expect(state.secondsUntilNext).toBe(30 * 60);
  });

  it('reports the current class with calculated countdown and progress', () => {
    const state = calculateScheduleState(periods, new Date('2026-08-10T09:01:00-07:00'));
    expect(state.phase).toBe('in_period');
    expect(state.currentPeriod?.period.id).toBe('period-1');
    expect(state.currentPeriod?.secondsRemaining).toBe(46 * 60);
    expect(state.currentPeriod?.progressPercent).toBe(50);
  });

  it('reports a passing period and the time until the next class', () => {
    const state = calculateScheduleState(periods, new Date('2026-08-10T09:49:00-07:00'));
    expect(state.phase).toBe('passing_period');
    expect(state.currentPeriod).toBeNull();
    expect(state.nextPeriod?.period.id).toBe('period-2');
    expect(state.secondsUntilNext).toBe(3 * 60);
  });

  it('reports after school with no next period', () => {
    const state = calculateScheduleState(periods, new Date('2026-08-10T15:30:00-07:00'));
    expect(state.phase).toBe('after_school');
    expect(state.currentPeriod).toBeNull();
    expect(state.nextPeriod).toBeNull();
  });

  it('reports no school for a weekend or closure', () => {
    const state = calculateScheduleState(periods, new Date('2026-08-09T09:00:00-07:00'), false);
    expect(state.phase).toBe('no_school');
  });

  it('loads regular B-day and special early-release fixtures through the same provider', async () => {
    const date = new Date('2026-08-10T09:00:00-07:00');
    const regularB = new MockBellLogicProvider('regular-b');
    const earlyRelease = new MockBellLogicProvider('early-release');

    expect((await regularB.getSchoolDay(date)).dayType).toBe('B');
    expect((await regularB.getPeriods(date))[0].name).toBe('AP Calculus BC');
    expect((await earlyRelease.getSchoolDay(date)).scheduleName).toBe('Early Release A Day');
    expect((await earlyRelease.getPeriods(date)).at(-1)?.endAt).toContain('12:22:00');
  });
});
