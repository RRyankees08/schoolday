import { describe, expect, it, vi } from 'vitest';
import {
  BellLogicProvider,
  BellLogicProviderError
} from '$lib/server/providers/belllogic/belllogic-provider';
import { MockBellLogicProvider } from '$lib/server/providers/mock/mock-belllogic-provider';
import { createScheduleProvider } from '$lib/server/providers/schedule-provider';

const apiState = {
  school: {
    name: 'Example High School',
    timeZone: 'America/Phoenix'
  },
  serverTime: '2026-08-10T16:10:00.000Z',
  schedule: {
    date: '2026-08-10',
    type: 'A Day Schedule',
    periods: [
      { name: '1st Hour', start: '08:15', end: '09:47' },
      { name: '3rd Hour', start: '09:53', end: '11:27' }
    ],
    isOverride: false,
    tomorrow: {
      date: '2026-08-11',
      type: 'B Day Schedule'
    }
  }
};

describe('BellLogicProvider', () => {
  it('fetches, validates, normalizes, and deduplicates the live state response', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(apiState));
    const provider = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us',
      origin: 'https://schoolday.example',
      fetch: fetcher
    });
    const at = new Date('2026-08-10T09:10:00-07:00');

    const [schoolDay, periods, current, next] = await Promise.all([
      provider.getSchoolDay(at),
      provider.getPeriods(at),
      provider.getCurrentPeriod(at),
      provider.getNextPeriod(at)
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://api.bell-logic.us/v1/state');
    expect(new Headers(init.headers).get('origin')).toBe('https://schoolday.example');
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
    expect(schoolDay).toEqual({
      date: '2026-08-10',
      isSchoolDay: true,
      scheduleName: 'A Day Schedule',
      dayType: 'A'
    });
    expect(periods[0]).toEqual({
      id: 'belllogic:2026-08-10:1:1st-hour',
      name: '1st Hour',
      startAt: '2026-08-10T08:15:00-07:00',
      endAt: '2026-08-10T09:47:00-07:00'
    });
    expect(current?.period.name).toBe('1st Hour');
    expect(next?.period.name).toBe('3rd Hour');
  });

  it('normalizes the schedule-only endpoint shape and special overrides', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        ...apiState.schedule,
        type: 'Wednesday Schedule',
        isOverride: true
      })
    );
    const provider = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us/v1/schedule/today',
      fetch: fetcher
    });

    await expect(provider.getSchoolDay(new Date('2026-08-10T09:10:00-07:00'))).resolves.toEqual({
      date: '2026-08-10',
      isSchoolDay: true,
      scheduleName: 'Special Bell Schedule',
      dayType: 'Wednesday'
    });
  });

  it('normalizes an empty schedule as a non-school day', async () => {
    const provider = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us/v1/state',
      fetch: vi.fn().mockResolvedValue(
        Response.json({
          ...apiState,
          schedule: {
            ...apiState.schedule,
            type: null,
            periods: []
          }
        })
      )
    });
    const at = new Date('2026-08-10T09:10:00-07:00');

    expect(await provider.getSchoolDay(at)).toEqual({
      date: '2026-08-10',
      isSchoolDay: false,
      scheduleName: 'No School',
      dayType: undefined
    });
    expect(await provider.getCurrentPeriod(at)).toBeNull();
    expect(await provider.getNextPeriod(at)).toBeNull();
  });

  it('rejects HTTP failures, malformed payloads, and the wrong schedule date', async () => {
    const at = new Date('2026-08-10T09:10:00-07:00');
    const forbidden = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us',
      fetch: vi
        .fn()
        .mockResolvedValue(Response.json({ error: 'forbidden_origin' }, { status: 403 }))
    });
    const malformed = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us',
      fetch: vi.fn().mockResolvedValue(Response.json({ schedule: { periods: 'nope' } }))
    });
    const wrongDate = new BellLogicProvider({
      apiUrl: 'https://api.bell-logic.us',
      fetch: vi.fn().mockResolvedValue(
        Response.json({
          ...apiState,
          schedule: { ...apiState.schedule, date: '2026-08-11' }
        })
      )
    });

    await expect(forbidden.getPeriods(at)).rejects.toMatchObject({
      name: 'BellLogicProviderError',
      status: 403
    } satisfies Partial<BellLogicProviderError>);
    await expect(malformed.getPeriods(at)).rejects.toThrow('invalid schedule payload');
    await expect(wrongDate.getPeriods(at)).rejects.toThrow(
      'returned schedule 2026-08-11 for requested date 2026-08-10'
    );
  });

  it('keeps fixtures as the factory default and selects live mode explicitly', () => {
    expect(createScheduleProvider()).toBeInstanceOf(MockBellLogicProvider);
    expect(
      createScheduleProvider({
        mode: 'belllogic',
        apiUrl: 'https://api.bell-logic.us'
      })
    ).toBeInstanceOf(BellLogicProvider);
  });
});
