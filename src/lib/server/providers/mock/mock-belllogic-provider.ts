import earlyRelease from '../../../../../fixtures/belllogic/early-release.json';
import regularADay from '../../../../../fixtures/belllogic/regular-a-day.json';
import regularBDay from '../../../../../fixtures/belllogic/regular-b-day.json';
import { calculateScheduleState } from '$lib/server/schedule/calculate-schedule-state';
import type { ScheduleProvider } from '../contracts';
import { normalizeBellLogicPeriods, normalizeBellLogicSchoolDay } from '../belllogic/normalize';
import { bellLogicScheduleSchema } from '../belllogic/schema';

export type MockScheduleVariant = 'regular-a' | 'regular-b' | 'early-release';

const fixtureByVariant = {
  'regular-a': regularADay,
  'regular-b': regularBDay,
  'early-release': earlyRelease
} as const;

export class MockBellLogicProvider implements ScheduleProvider {
  private readonly fixture;

  constructor(variant: MockScheduleVariant = 'regular-a') {
    this.fixture = bellLogicScheduleSchema.parse(fixtureByVariant[variant]);
  }

  async getSchoolDay(date: Date) {
    return normalizeBellLogicSchoolDay(this.fixture, date);
  }

  async getPeriods(date: Date) {
    return normalizeBellLogicPeriods(this.fixture, date);
  }

  async getCurrentPeriod(date: Date) {
    const state = calculateScheduleState(
      await this.getPeriods(date),
      date,
      this.fixture.is_school_day
    );
    return state.currentPeriod;
  }

  async getNextPeriod(date: Date) {
    const state = calculateScheduleState(
      await this.getPeriods(date),
      date,
      this.fixture.is_school_day
    );
    return state.nextPeriod;
  }
}
