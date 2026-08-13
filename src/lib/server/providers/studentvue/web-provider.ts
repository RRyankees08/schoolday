import * as cheerio from 'cheerio';
import type { Course, CourseGrade, GradeSnapshot, GradebookAssignment } from '$lib/models';
import type { GradebookProvider } from '../contracts';

const LOGIN_PATH = '/PXP2_Login_Student.aspx';
const GRADEBOOK_PATH = '/PXP2_Gradebook.aspx';
const LOAD_CONTROL_PATH = '/service/PXP2Communication.asmx/LoadControl';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface StudentVueWebProviderOptions {
  baseUrl: string;
  username: string;
  password: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

interface GradebookFocusArgs {
  studentGU?: string;
  schoolID?: number;
  classID?: number;
  markPeriodGU?: string;
  gradePeriodGU?: string;
  subjectID?: number;
  teacherID?: number;
  assignmentID?: number;
  standardIdentifier?: string | null;
  AGU?: string;
  OrgYearGU?: string;
  gradingPeriodGroup?: string | null;
}

interface ParsedCourse {
  externalId: string;
  name: string;
  teacher?: string;
  gradingPeriod?: string;
  rawGrade?: string;
  focus: GradebookFocusArgs;
}

interface ParsedGradebook {
  capturedAt: string;
  courses: Course[];
  courseGrades: CourseGrade[];
  assignments: GradebookAssignment[];
}

type AssignmentRow = Record<string, unknown>;

function textValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = cheerio
    .load(`<span>${String(value)}</span>`)
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

function gridCellValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const source = value.trim();
  if (!source.startsWith('{')) return value;

  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return value;
    const cell = parsed as Record<string, unknown>;
    return cell.value ?? cell.text ?? cell.displayValue;
  } catch {
    return value;
  }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = textValue(value);
  if (!text) return undefined;
  const match = text.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentageValue(value: unknown): number | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const explicit = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (explicit) return Number(explicit[1]);
  return undefined;
}

function letterGrade(value: string | undefined): string | undefined {
  return value?.match(/(?:^|\s)([A-F][+-]?)(?=\s|$)/i)?.[1]?.toUpperCase();
}

function decodeHtmlAttribute(value: string): string {
  return (
    cheerio
      .load(`<span data-value="${value.replaceAll('"', '&quot;')}"></span>`)('span')
      .attr('data-value') ?? value
  );
}

function safeFocus(value: string | undefined): GradebookFocusArgs | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(decodeHtmlAttribute(value)) as { FocusArgs?: GradebookFocusArgs };
    return parsed.FocusArgs;
  } catch {
    return undefined;
  }
}

function parseCourses(html: string): ParsedCourse[] {
  const $ = cheerio.load(html);
  const courses: ParsedCourse[] = [];
  $('.gb-class-header').each((_, element) => {
    const row = $(element);
    const title = row.find('.course-title').first();
    const name = title.text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    const gradeRow = row.nextAll('.gb-class-row[data-mark-gu]').first();
    const focus = safeFocus(gradeRow.find('.course-markperiod[data-focus]').attr('data-focus'));
    const classId = focus?.classID;
    const guid = row.attr('data-guid')?.trim();
    const externalId = guid || (classId === undefined ? undefined : String(classId));
    if (!focus || !externalId) return;

    const teacher = row.find('.teacher.hide-for-screen').first().text().replace(/\s+/g, ' ').trim();
    const gradingPeriod = gradeRow
      .find('.course-markperiod')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const rawGrade = gradeRow.find('.mark').first().text().replace(/\s+/g, ' ').trim();

    courses.push({
      externalId,
      name,
      teacher: teacher || undefined,
      gradingPeriod: gradingPeriod || undefined,
      rawGrade: rawGrade || undefined,
      focus
    });
  });
  return courses;
}

function extractJsonArray(source: string, property: string): unknown[] {
  const marker = source.indexOf(`"${property}":`);
  if (marker < 0) return [];
  const start = source.indexOf('[', marker);
  if (start < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(source.slice(start, index + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

function parseAssignmentRows(html: string): AssignmentRow[] {
  const $ = cheerio.load(html);
  const script = $('script')
    .map((_, element) => $(element).html() ?? '')
    .get()
    .find((value) => value.includes('AssignmentsGrid') && value.includes('"dataSource"'));
  if (!script) return [];
  return extractJsonArray(script, 'dataSource').filter(
    (value): value is AssignmentRow => Boolean(value) && typeof value === 'object'
  );
}

function rowValue(row: AssignmentRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return undefined;
}

function stableAssignmentId(row: AssignmentRow, courseId: string, title: string): string {
  const sourceId = textValue(
    rowValue(
      row,
      'GBAssignmentGU',
      'GBAssignmentID',
      'AssignmentGU',
      'AssignmentID',
      'DGU',
      'gradeBookId',
      'GBGradeBookID',
      'boid'
    )
  );
  if (sourceId) return sourceId;
  const date = textValue(rowValue(row, 'Date', 'DueDate')) ?? 'undated';
  return `${courseId}:${date}:${title}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-');
}

function normalizeAssignment(
  row: AssignmentRow,
  courseId: string,
  capturedAt: string
): GradebookAssignment | undefined {
  const title = textValue(gridCellValue(rowValue(row, 'GBAssignment', 'Assignment', 'Title')));
  if (!title) return undefined;

  const score = gridCellValue(rowValue(row, 'GBScore', 'Score', 'PointsEarned'));
  const possible = rowValue(row, 'GBPoints', 'Points', 'PointsPossible');
  const status = [
    textValue(rowValue(row, 'GBScoreType', 'ScoreType')),
    textValue(rowValue(row, 'GBNotes', 'Notes')),
    textValue(score)
  ]
    .filter(Boolean)
    .join(' ');
  const pointsEarned = numberValue(score);
  const pointsPossible = numberValue(possible);
  const percentage =
    percentageValue(score) ??
    (pointsEarned !== undefined && pointsPossible
      ? Math.round((pointsEarned / pointsPossible) * 1000) / 10
      : undefined);

  return {
    id: `studentvue:${stableAssignmentId(row, courseId, title)}`,
    courseId: `studentvue:${courseId}`,
    title,
    pointsEarned,
    pointsPossible,
    percentage,
    missing: /\bmissing\b/i.test(status),
    excused: /\bexcused\b/i.test(status),
    capturedAt
  };
}

function splitSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  update(headers: Headers): void {
    const values = headers.getSetCookie?.() ?? splitSetCookie(headers.get('set-cookie') ?? '');
    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function providerError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Error('StudentVUE request timed out', { cause: error });
  }
  if (error instanceof Error && error.message.startsWith('StudentVUE')) return error;
  return new Error('StudentVUE web provider failed', { cause: error });
}

export class StudentVueWebProvider implements GradebookProvider {
  private readonly options: StudentVueWebProviderOptions;
  private readonly origin: string;
  private readonly requestFetch: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly cookies = new CookieJar();
  private data: Promise<ParsedGradebook> | null = null;

  constructor(options: StudentVueWebProviderOptions) {
    this.options = options;
    this.origin = new URL(options.baseUrl).origin;
    this.requestFetch = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getCourses(): Promise<Course[]> {
    return (await this.load()).courses;
  }

  async getCourseGrades(): Promise<CourseGrade[]> {
    return (await this.load()).courseGrades;
  }

  async getGradebookAssignments(): Promise<GradebookAssignment[]> {
    return (await this.load()).assignments;
  }

  async getSnapshot(): Promise<GradeSnapshot> {
    const data = await this.load();
    return {
      capturedAt: data.capturedAt,
      courseGrades: data.courseGrades,
      assignments: data.assignments
    };
  }

  private load(): Promise<ParsedGradebook> {
    this.data ??= this.loadGradebook();
    return this.data;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    followRedirects = true
  ): Promise<Response> {
    let url = new URL(path, this.origin);
    let method = init.method ?? 'GET';
    let body = init.body;

    for (let redirect = 0; redirect <= 5; redirect += 1) {
      if (url.origin !== this.origin)
        throw new Error('StudentVUE attempted a cross-origin redirect');
      const headers = new Headers(init.headers);
      const cookie = this.cookies.header();
      if (cookie) headers.set('cookie', cookie);

      const response = await this.requestFetch(url, {
        ...init,
        method,
        body,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      this.cookies.update(response.headers);

      const location = response.headers.get('location');
      if (!followRedirects || !location || response.status < 300 || response.status >= 400) {
        return response;
      }
      url = new URL(location, url);
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET';
        body = undefined;
      }
    }
    throw new Error('StudentVUE redirected too many times');
  }

  private async login(): Promise<void> {
    const loginPage = await this.request(LOGIN_PATH);
    if (!loginPage.ok) throw new Error(`StudentVUE login page returned HTTP ${loginPage.status}`);
    const loginHtml = await loginPage.text();
    const $ = cheerio.load(loginHtml);
    const form = new URLSearchParams();
    $('input[type="hidden"][name]').each((_, element) => {
      form.set($(element).attr('name')!, $(element).attr('value') ?? '');
    });
    form.set('ctl00$MainContent$username', this.options.username);
    form.set('ctl00$MainContent$password', this.options.password);
    form.set('ctl00$MainContent$Submit1', $('#ctl00_MainContent_Submit1').attr('value') ?? 'Login');

    const response = await this.request(`${LOGIN_PATH}?regenerateSessionId=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form
    });
    if (!response.ok) throw new Error(`StudentVUE login returned HTTP ${response.status}`);
    const html = await response.text();
    const finalPage = cheerio.load(html);
    if (finalPage('#ctl00_MainContent_username').length > 0) {
      throw new Error('StudentVUE rejected the configured username or password');
    }
  }

  private async loadControl(focus: GradebookFocusArgs): Promise<string> {
    const response = await this.request(LOAD_CONTROL_PATH, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        AGU: focus.AGU ?? '0',
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        request: { control: 'Gradebook_ClassDetails', parameters: focus }
      })
    });
    if (!response.ok) throw new Error(`StudentVUE gradebook returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('d' in payload)) {
      throw new Error('StudentVUE returned an invalid gradebook response');
    }
    const data = (payload as { d?: { Error?: { Message?: string }; Data?: { html?: string } } }).d;
    if (data?.Error) throw new Error('StudentVUE could not load gradebook details');
    if (typeof data?.Data?.html !== 'string') {
      throw new Error('StudentVUE gradebook response did not include content');
    }
    return data.Data.html;
  }

  private async loadGradebook(): Promise<ParsedGradebook> {
    try {
      await this.login();
      const response = await this.request(GRADEBOOK_PATH);
      if (!response.ok) throw new Error(`StudentVUE gradebook returned HTTP ${response.status}`);
      const html = await response.text();
      if (cheerio.load(html)('#ctl00_MainContent_username').length > 0) {
        throw new Error('StudentVUE session expired while loading grades');
      }

      const capturedAt = this.now().toISOString();
      const parsedCourses = parseCourses(html);
      if (parsedCourses.length === 0) {
        throw new Error('StudentVUE returned no recognizable courses');
      }
      const courses: Course[] = parsedCourses.map((course) => ({
        id: `studentvue:${course.externalId}`,
        externalIds: { studentVue: course.externalId },
        name: course.name,
        teacher: course.teacher
      }));
      const courseGrades: CourseGrade[] = parsedCourses.flatMap((course) => {
        const percentage = percentageValue(course.rawGrade);
        const letter = letterGrade(course.rawGrade);
        if (!course.rawGrade && percentage === undefined && !letter) return [];
        return [
          {
            courseId: `studentvue:${course.externalId}`,
            percentage,
            letterGrade: letter,
            rawDisplay: course.rawGrade,
            gradingPeriod: course.gradingPeriod,
            capturedAt
          }
        ];
      });

      const assignments: GradebookAssignment[] = [];
      for (let offset = 0; offset < parsedCourses.length; offset += 3) {
        const batch = parsedCourses.slice(offset, offset + 3);
        const details = await Promise.all(batch.map((course) => this.loadControl(course.focus)));
        for (let index = 0; index < batch.length; index += 1) {
          const course = batch[index];
          for (const row of parseAssignmentRows(details[index])) {
            const assignment = normalizeAssignment(row, course.externalId, capturedAt);
            if (assignment) assignments.push(assignment);
          }
        }
      }

      return { capturedAt, courses, courseGrades, assignments };
    } catch (error) {
      throw providerError(error);
    }
  }
}
