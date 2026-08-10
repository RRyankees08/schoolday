import type { Period, SchoolDay } from '$lib/models';
import type {
  BellLogicApiResponse,
  BellLogicApiSchedule,
  BellLogicScheduleFixture
} from './schema';

const PHOENIX_OFFSET = '-07:00';

export function dateKeyInPhoenix(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function normalizeBellLogicSchoolDay(
  fixture: BellLogicScheduleFixture,
  date: Date
): SchoolDay {
  return {
    date: dateKeyInPhoenix(date),
    isSchoolDay: fixture.is_school_day,
    scheduleName: fixture.schedule_name,
    dayType: fixture.day_type
  };
}

export function normalizeBellLogicPeriods(fixture: BellLogicScheduleFixture, date: Date): Period[] {
  const dateKey = dateKeyInPhoenix(date);
  return fixture.periods.map((period) => ({
    id: `belllogic:${fixture.schedule_id}:${period.id}`,
    name: period.label,
    startAt: `${dateKey}T${period.starts}:00${PHOENIX_OFFSET}`,
    endAt: `${dateKey}T${period.ends}:00${PHOENIX_OFFSET}`
  }));
}

export function bellLogicScheduleFromApiResponse(
  response: BellLogicApiResponse
): BellLogicApiSchedule {
  return 'schedule' in response ? response.schedule : response;
}

function scheduleDayType(scheduleType: string | null): string | undefined {
  if (!scheduleType) return undefined;
  const dayMatch = /^([AB]) Day Schedule$/i.exec(scheduleType);
  if (dayMatch) return dayMatch[1].toUpperCase();
  if (/^Wednesday Schedule$/i.test(scheduleType)) return 'Wednesday';
  return scheduleType.replace(/\s+Schedule$/i, '');
}

function periodIdPart(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'period'
  );
}

export function normalizeBellLogicApiSchoolDay(schedule: BellLogicApiSchedule): SchoolDay {
  return {
    date: schedule.date,
    isSchoolDay: schedule.periods.length > 0,
    scheduleName: schedule.isOverride ? 'Special Bell Schedule' : (schedule.type ?? 'No School'),
    dayType: scheduleDayType(schedule.type)
  };
}

export function normalizeBellLogicApiPeriods(schedule: BellLogicApiSchedule): Period[] {
  return schedule.periods.map((period, index) => ({
    id: `belllogic:${schedule.date}:${index + 1}:${periodIdPart(period.name)}`,
    name: period.name,
    startAt: `${schedule.date}T${period.start}:00${PHOENIX_OFFSET}`,
    endAt: `${schedule.date}T${period.end}:00${PHOENIX_OFFSET}`
  }));
}
