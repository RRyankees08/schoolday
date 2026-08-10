import type { Period, PeriodState, SchoolDay } from '$lib/models';
import { calculateScheduleState } from '$lib/server/schedule/calculate-schedule-state';
import type { ScheduleProvider } from '../contracts';
import {
  bellLogicScheduleFromApiResponse,
  dateKeyInPhoenix,
  normalizeBellLogicApiPeriods,
  normalizeBellLogicApiSchoolDay
} from './normalize';
import { bellLogicApiResponseSchema, type BellLogicApiSchedule } from './schema';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface BellLogicProviderOptions {
  apiUrl: string;
  origin?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

interface CachedSchedule {
  expiresAt: number;
  schedule: BellLogicApiSchedule;
}

export class BellLogicProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'BellLogicProviderError';
  }
}

function stateEndpoint(apiUrl: string): URL {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new BellLogicProviderError('Bell-Logic API URL must be an absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BellLogicProviderError('Bell-Logic API URL must use HTTP or HTTPS');
  }

  if (url.pathname === '' || url.pathname === '/') {
    url.pathname = '/v1/state';
  }

  return url;
}

function requestOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new BellLogicProviderError('Bell-Logic request origin must be an absolute origin');
  }

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new BellLogicProviderError('Bell-Logic request origin must contain only an HTTP origin');
  }

  return url.origin;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export class BellLogicProvider implements ScheduleProvider {
  private readonly endpoint: URL;
  private readonly origin?: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly clock: () => number;
  private readonly cache = new Map<string, CachedSchedule>();
  private readonly inFlight = new Map<string, Promise<BellLogicApiSchedule>>();

  constructor(options: BellLogicProviderOptions) {
    this.endpoint = stateEndpoint(options.apiUrl);
    this.origin = requestOrigin(options.origin);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.cacheTtlMs = positiveNumber(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS);
    this.clock = options.now ?? Date.now;
  }

  async getSchoolDay(date: Date): Promise<SchoolDay> {
    return normalizeBellLogicApiSchoolDay(await this.getSchedule(date));
  }

  async getPeriods(date: Date): Promise<Period[]> {
    return normalizeBellLogicApiPeriods(await this.getSchedule(date));
  }

  async getCurrentPeriod(date: Date): Promise<PeriodState | null> {
    const schedule = await this.getSchedule(date);
    return calculateScheduleState(
      normalizeBellLogicApiPeriods(schedule),
      date,
      schedule.periods.length > 0
    ).currentPeriod;
  }

  async getNextPeriod(date: Date): Promise<PeriodState | null> {
    const schedule = await this.getSchedule(date);
    return calculateScheduleState(
      normalizeBellLogicApiPeriods(schedule),
      date,
      schedule.periods.length > 0
    ).nextPeriod;
  }

  private getSchedule(date: Date): Promise<BellLogicApiSchedule> {
    if (Number.isNaN(date.getTime())) {
      return Promise.reject(new BellLogicProviderError('Bell-Logic schedule date is invalid'));
    }

    const dateKey = dateKeyInPhoenix(date);
    const cached = this.cache.get(dateKey);
    if (cached && cached.expiresAt > this.clock()) return Promise.resolve(cached.schedule);

    const pending = this.inFlight.get(dateKey);
    if (pending) return pending;

    const request = this.fetchSchedule(dateKey).finally(() => this.inFlight.delete(dateKey));
    this.inFlight.set(dateKey, request);
    return request;
  }

  private async fetchSchedule(dateKey: string): Promise<BellLogicApiSchedule> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers({ accept: 'application/json' });
      if (this.origin) headers.set('origin', this.origin);

      const response = await this.fetcher(this.endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new BellLogicProviderError(
          `Bell-Logic API request failed with status ${response.status}`,
          response.status
        );
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new BellLogicProviderError('Bell-Logic API response was too large');
      }

      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw new BellLogicProviderError('Bell-Logic API response was too large');
      }

      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        throw new BellLogicProviderError('Bell-Logic API returned invalid JSON');
      }

      const parsed = bellLogicApiResponseSchema.safeParse(value);
      if (!parsed.success) {
        throw new BellLogicProviderError('Bell-Logic API returned an invalid schedule payload');
      }

      const schedule = bellLogicScheduleFromApiResponse(parsed.data);
      if (schedule.date !== dateKey) {
        throw new BellLogicProviderError(
          `Bell-Logic returned schedule ${schedule.date} for requested date ${dateKey}`
        );
      }

      this.cache.set(dateKey, {
        expiresAt: this.clock() + this.cacheTtlMs,
        schedule
      });
      return schedule;
    } catch (error) {
      if (error instanceof BellLogicProviderError) throw error;
      if (controller.signal.aborted) {
        throw new BellLogicProviderError(
          `Bell-Logic API request timed out after ${this.timeoutMs}ms`
        );
      }
      throw new BellLogicProviderError(
        `Bell-Logic API request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
