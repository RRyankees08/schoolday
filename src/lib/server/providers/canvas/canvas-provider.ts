import { z } from 'zod';
import type { Assignment, CalendarEvent, Course, Submission } from '$lib/models';
import type { CanvasProvider as CanvasProviderContract } from '../contracts';
import {
  normalizeCanvasAssignments,
  normalizeCanvasCalendarEvents,
  normalizeCanvasCourses,
  normalizeCanvasSubmissions
} from './normalize';
import {
  canvasAssignmentSchema,
  canvasCalendarEventSchema,
  canvasCourseSchema,
  type CanvasAssignmentRecord,
  type CanvasCourseRecord,
  type CanvasSubmissionRecord
} from './schema';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_CONCURRENCY = 4;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_RETRY_DELAY_MS = 10_000;
const CALENDAR_CONTEXT_LIMIT = 10;

type Fetcher = typeof globalThis.fetch;
type Sleeper = (milliseconds: number) => Promise<void>;

export interface CanvasProviderOptions {
  baseUrl: string;
  token: string;
  fetch?: Fetcher;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxRetries?: number;
  maxPages?: number;
  concurrency?: number;
  retryBaseDelayMs?: number;
  calendarWindowDays?: number;
  now?: () => Date;
  sleep?: Sleeper;
}

interface CachedValue<T> {
  expiresAt: number;
  value: T;
}

interface AssignmentData {
  assignments: CanvasAssignmentRecord[];
  submissions: CanvasSubmissionRecord[];
}

export class CanvasProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'CanvasProviderError';
  }
}

function canvasApiBase(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CanvasProviderError('Canvas base URL must be an absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CanvasProviderError('Canvas base URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CanvasProviderError('Canvas base URL cannot contain credentials, query, or hash');
  }

  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/api/v1') ? `${path}/` : `${path}/api/v1/`;
  return url;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum
    ? Math.min(value, maximum)
    : fallback;
}

function nextLink(header: string | null): string | null {
  if (!header) return null;
  const links = header.matchAll(/<([^>]+)>\s*;\s*rel="?([^";,]+)"?/g);
  for (const match of links) {
    if (match[2].split(/\s+/).includes('next')) return match[1];
  }
  return null;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function retryAfterMilliseconds(response: Response, fallback: number): number {
  const value = response.headers.get('retry-after');
  if (!value) return Math.min(fallback, MAX_RETRY_DELAY_MS);
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds * 1000), MAX_RETRY_DELAY_MS);
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.min(Math.max(0, timestamp - Date.now()), MAX_RETRY_DELAY_MS);
  }
  return Math.min(fallback, MAX_RETRY_DELAY_MS);
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class CanvasProvider implements CanvasProviderContract {
  private readonly apiBase: URL;
  private readonly token: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxRetries: number;
  private readonly maxPages: number;
  private readonly concurrency: number;
  private readonly retryBaseDelayMs: number;
  private readonly calendarWindowDays: number;
  private readonly clock: () => Date;
  private readonly sleeper: Sleeper;
  private readonly cache = new Map<string, CachedValue<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: CanvasProviderOptions) {
    this.apiBase = canvasApiBase(options.baseUrl);
    this.token = options.token.trim();
    if (!this.token || /[\r\n]/.test(this.token)) {
      throw new CanvasProviderError('A valid Canvas access token is required');
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 60_000);
    this.cacheTtlMs = boundedInteger(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS, 0, 300_000);
    this.maxRetries = boundedInteger(options.maxRetries, DEFAULT_MAX_RETRIES, 0, 5);
    this.maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, 1, 100);
    this.concurrency = boundedInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, 10);
    this.retryBaseDelayMs = boundedInteger(options.retryBaseDelayMs, 250, 0, 10_000);
    this.calendarWindowDays = boundedInteger(options.calendarWindowDays, 7, 1, 31);
    this.clock = options.now ?? (() => new Date());
    this.sleeper =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getCourses(): Promise<Course[]> {
    return normalizeCanvasCourses(await this.getRawCourses());
  }

  async getAssignments(): Promise<Assignment[]> {
    const data = await this.getAssignmentData();
    return normalizeCanvasAssignments(data.assignments, data.submissions);
  }

  async getSubmissions(): Promise<Submission[]> {
    return normalizeCanvasSubmissions((await this.getAssignmentData()).submissions);
  }

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const events = await this.cached('calendar-events', async () => {
      const courses = await this.getRawCourses();
      const contextBatches = chunks(
        courses.map((course) => `course_${course.id}`),
        CALENDAR_CONTEXT_LIMIT
      );
      if (contextBatches.length === 0) return [];

      const start = this.clock();
      const end = new Date(start.getTime() + this.calendarWindowDays * 24 * 60 * 60 * 1000);
      const pages = await mapWithConcurrency(contextBatches, this.concurrency, (contexts) => {
        const url = this.endpoint('calendar_events');
        url.searchParams.set('type', 'event');
        url.searchParams.set('start_date', start.toISOString());
        url.searchParams.set('end_date', end.toISOString());
        for (const context of contexts) url.searchParams.append('context_codes[]', context);
        return this.getPaginated(url, canvasCalendarEventSchema);
      });
      return pages.flat();
    });

    return normalizeCanvasCalendarEvents(events);
  }

  private getRawCourses(): Promise<CanvasCourseRecord[]> {
    return this.cached('courses', () => {
      const url = this.endpoint('courses');
      url.searchParams.set('enrollment_state', 'active');
      url.searchParams.set('enrollment_type', 'student');
      url.searchParams.append('include[]', 'teachers');
      return this.getPaginated(url, canvasCourseSchema);
    });
  }

  private getAssignmentData(): Promise<AssignmentData> {
    return this.cached('assignment-data', async () => {
      const courses = await this.getRawCourses();
      const pages = await mapWithConcurrency(courses, this.concurrency, (course) => {
        const url = this.endpoint(`courses/${course.id}/assignments`);
        url.searchParams.set('order_by', 'due_at');
        url.searchParams.append('include[]', 'submission');
        return this.getPaginated(url, canvasAssignmentSchema);
      });
      const assignments = pages.flat();
      const submissions = assignments.flatMap((assignment) =>
        assignment.submission ? [assignment.submission] : []
      );
      return { assignments, submissions };
    });
  }

  private endpoint(path: string): URL {
    return new URL(path.replace(/^\/+/, ''), this.apiBase);
  }

  private async getPaginated<T>(url: URL, schema: z.ZodType<T>): Promise<T[]> {
    const values: T[] = [];
    const visited = new Set<string>();
    let current: URL | null = new URL(url);
    if (!current.searchParams.has('per_page')) current.searchParams.set('per_page', '100');

    for (let page = 0; current && page < this.maxPages; page += 1) {
      if (visited.has(current.href))
        throw new CanvasProviderError('Canvas pagination loop detected');
      visited.add(current.href);
      const response = await this.fetchWithRetry(current);
      const body = await this.readPage(response);
      const parsed = z.array(schema).safeParse(body);
      if (!parsed.success) {
        throw new CanvasProviderError('Canvas API returned an invalid response payload');
      }
      values.push(...parsed.data);

      const href = nextLink(response.headers.get('link'));
      if (!href) {
        current = null;
        continue;
      }

      const paginationUrl: URL = new URL(href, current);
      if (
        paginationUrl.origin !== this.apiBase.origin ||
        !paginationUrl.pathname.startsWith(this.apiBase.pathname)
      ) {
        throw new CanvasProviderError('Canvas pagination link escaped the configured API origin');
      }
      current = paginationUrl;
    }

    if (current) throw new CanvasProviderError(`Canvas pagination exceeded ${this.maxPages} pages`);
    return values;
  }

  private async fetchWithRetry(url: URL): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.token}`
          },
          signal: controller.signal
        });

        if (response.ok) return response;
        if (attempt < this.maxRetries && retryableStatus(response.status)) {
          const delay = retryAfterMilliseconds(response, this.retryBaseDelayMs * 2 ** attempt);
          await response.body?.cancel().catch(() => undefined);
          await this.sleeper(delay);
          continue;
        }
        throw new CanvasProviderError(
          `Canvas API request failed with status ${response.status}`,
          response.status
        );
      } catch (error) {
        if (error instanceof CanvasProviderError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleeper(Math.min(this.retryBaseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS));
          continue;
        }
        if (controller.signal.aborted) {
          throw new CanvasProviderError(`Canvas API request timed out after ${this.timeoutMs}ms`);
        }
        throw new CanvasProviderError(
          `Canvas API request failed: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new CanvasProviderError('Canvas API request failed');
  }

  private async readPage(response: Response): Promise<unknown> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAGE_BYTES) {
      throw new CanvasProviderError('Canvas API response page was too large');
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PAGE_BYTES) {
      throw new CanvasProviderError('Canvas API response page was too large');
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new CanvasProviderError('Canvas API returned invalid JSON');
    }
  }

  private cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key) as CachedValue<T> | undefined;
    if (cached && cached.expiresAt > this.clock().getTime()) return Promise.resolve(cached.value);
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const request = loader()
      .then((value) => {
        this.cache.set(key, {
          expiresAt: this.clock().getTime() + this.cacheTtlMs,
          value
        });
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }
}
