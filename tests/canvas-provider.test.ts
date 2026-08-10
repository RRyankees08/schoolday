import { describe, expect, it, vi } from 'vitest';
import { CanvasProvider, CanvasProviderError } from '$lib/server/providers/canvas/canvas-provider';
import { createCanvasProvider } from '$lib/server/providers/canvas-provider';
import { MockCanvasProvider } from '$lib/server/providers/mock/mock-canvas-provider';

const course = {
  id: 4101,
  name: 'AP Physics 2',
  course_code: 'PHY-AP2',
  teachers: [{ id: 7, display_name: 'Dr. Ortega' }]
};

const assignment = {
  id: 81001,
  course_id: 4101,
  name: 'Capacitor Bank Lab Analysis',
  due_at: '2026-08-10T18:00:00-07:00',
  points_possible: 50,
  html_url: 'https://canvas.example.edu/courses/4101/assignments/81001',
  submission: {
    id: 91001,
    assignment_id: 81001,
    workflow_state: 'submitted',
    submitted_at: '2026-08-10T17:00:00-07:00',
    late: false,
    missing: false,
    graded_at: null,
    grade: null,
    score: null
  }
};

function jsonPage(value: unknown, link?: string): Response {
  return Response.json(value, {
    headers: link ? { link } : undefined
  });
}

describe('CanvasProvider', () => {
  it('authenticates, follows pagination, normalizes courses, and keeps tokens server-side', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      void init;
      const url = new URL(String(input));
      if (url.searchParams.get('page') === 'opaque-next')
        return jsonPage([{ ...course, id: 4102 }]);
      return jsonPage(
        [course],
        '<https://canvas.example.edu/api/v1/courses?page=opaque-next>; rel="next"'
      );
    });
    const provider = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu',
      token: 'secret-token',
      fetch: fetcher
    });

    const courses = await provider.getCourses();

    expect(courses).toHaveLength(2);
    expect(courses[0]).toEqual({
      id: 'canvas:4101',
      externalIds: { canvas: '4101' },
      name: 'AP Physics 2',
      shortName: 'PHY-AP2',
      teacher: 'Dr. Ortega'
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain('secret-token');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
    }
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('enrollment_state')).toBe(
      'active'
    );
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('enrollment_type')).toBe(
      'student'
    );
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('per_page')).toBe('100');
  });

  it('loads assignments with current-user submissions once for both provider methods', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/courses')) return jsonPage([course]);
      if (url.pathname.endsWith('/courses/4101/assignments')) {
        return jsonPage([
          assignment,
          {
            ...assignment,
            id: 81002,
            name: 'Unsubmitted lab reflection',
            submission: null
          }
        ]);
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu/api/v1',
      token: 'token',
      fetch: fetcher
    });

    const [assignments, submissions] = await Promise.all([
      provider.getAssignments(),
      provider.getSubmissions()
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    const assignmentRequest = new URL(String(fetcher.mock.calls[1][0]));
    expect(assignmentRequest.searchParams.getAll('include[]')).toContain('submission');
    expect(assignments[0]).toMatchObject({
      id: 'canvas:81001',
      courseId: 'canvas:4101',
      submitted: true,
      submissionState: 'submitted'
    });
    expect(assignments[1]).toMatchObject({
      id: 'canvas:81002',
      submitted: false,
      submissionState: 'not_submitted'
    });
    expect(submissions[0]).toEqual({
      id: 'canvas:91001',
      assignmentId: 'canvas:81001',
      submittedAt: '2026-08-10T17:00:00-07:00',
      state: 'submitted'
    });
  });

  it('batches course calendar contexts in groups of ten and uses a seven-day window', async () => {
    const courses = Array.from({ length: 11 }, (_, index) => ({
      ...course,
      id: 4100 + index
    }));
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/courses')) return jsonPage(courses);
      if (url.pathname.endsWith('/calendar_events')) {
        const context = url.searchParams.getAll('context_codes[]')[0];
        return jsonPage([
          {
            id: `event-${context}`,
            title: 'Course event',
            start_at: '2026-08-10T15:20:00-07:00',
            end_at: null,
            context_code: context,
            html_url: 'https://canvas.example.edu/calendar'
          }
        ]);
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu',
      token: 'token',
      fetch: fetcher,
      now: () => new Date('2026-08-10T09:00:00-07:00')
    });

    const events = await provider.getCalendarEvents();
    const eventRequests = fetcher.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith('/calendar_events'));

    expect(eventRequests).toHaveLength(2);
    expect(eventRequests[0].searchParams.getAll('context_codes[]')).toHaveLength(10);
    expect(eventRequests[1].searchParams.getAll('context_codes[]')).toHaveLength(1);
    expect(eventRequests[0].searchParams.get('start_date')).toBe('2026-08-10T16:00:00.000Z');
    expect(eventRequests[0].searchParams.get('end_date')).toBe('2026-08-17T16:00:00.000Z');
    expect(events[0].courseId).toBe('canvas:4100');
  });

  it('retries rate limits using Retry-After and rejects hostile pagination links', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryFetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonPage([course]));
    const retrying = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu',
      token: 'token',
      fetch: retryFetcher,
      sleep
    });

    await expect(retrying.getCourses()).resolves.toHaveLength(1);
    expect(retryFetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);

    const hostile = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu',
      token: 'token',
      fetch: vi
        .fn()
        .mockResolvedValue(jsonPage([course], '<https://attacker.example/steal>; rel="next"'))
    });
    await expect(hostile.getCourses()).rejects.toThrow(
      'pagination link escaped the configured API origin'
    );
  });

  it('reports authorization failures without exposing the token', async () => {
    const provider = new CanvasProvider({
      baseUrl: 'https://canvas.example.edu',
      token: 'do-not-leak',
      maxRetries: 0,
      fetch: vi.fn().mockResolvedValue(Response.json({ errors: [] }, { status: 401 }))
    });

    const error = await provider.getCourses().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: 'CanvasProviderError',
      status: 401
    } satisfies Partial<CanvasProviderError>);
    expect(String(error)).not.toContain('do-not-leak');
  });

  it('keeps the fixture provider as the factory default', () => {
    expect(createCanvasProvider()).toBeInstanceOf(MockCanvasProvider);
    expect(
      createCanvasProvider({
        mode: 'canvas',
        baseUrl: 'https://canvas.example.edu',
        token: 'token'
      })
    ).toBeInstanceOf(CanvasProvider);
  });
});
