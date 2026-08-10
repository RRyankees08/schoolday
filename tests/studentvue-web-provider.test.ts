import { describe, expect, it, vi } from 'vitest';
import { StudentVueWebProvider } from '$lib/server/providers/studentvue/web-provider';

const focus = (classID: number) =>
  JSON.stringify({
    FocusArgs: {
      studentGU: 'private-student-id',
      schoolID: 22,
      classID,
      markPeriodGU: 'mark-period',
      gradePeriodGU: 'grade-period',
      AGU: '0',
      OrgYearGU: 'org-year'
    }
  });

const loginPage = `
  <form>
    <input type="hidden" name="__VIEWSTATE" value="state" />
    <input type="hidden" name="__EVENTVALIDATION" value="validation" />
    <input id="ctl00_MainContent_username" name="ctl00$MainContent$username" />
    <input id="ctl00_MainContent_password" name="ctl00$MainContent$password" />
    <input id="ctl00_MainContent_Submit1" value="Login" />
  </form>`;

const gradebookPage = `
  <div class="gb-class-header" data-guid="physics-course">
    <button class="course-title">AP Physics 2</button>
    <div class="teacher hide-for-screen">Dr. Ortega</div>
  </div>
  <div class="gb-class-row" data-mark-gu="physics-mark">
    <button class="course-markperiod" data-focus='${focus(101)}'>Quarter 1</button>
    <span class="mark">A- 91.8%</span>
  </div>
  <div class="gb-class-header" data-guid="government-course">
    <button class="course-title">AP Government</button>
    <div class="teacher hide-for-screen">Ms. Bennett</div>
  </div>
  <div class="gb-class-row" data-mark-gu="government-mark">
    <button class="course-markperiod" data-focus='${focus(102)}'>Quarter 1</button>
    <span class="mark">A 94.2%</span>
  </div>`;

function assignmentDetail(classID: number): string {
  const rows =
    classID === 101
      ? [
          {
            GBAssignmentID: 'assignment-1',
            GBAssignment: '<span>Induction Quiz</span>',
            GBScore: '17',
            GBPoints: '20',
            GBScoreType: 'Score',
            GBNotes: ''
          },
          {
            GBAssignmentID: 'assignment-2',
            GBAssignment: 'Lab Report',
            GBScore: 'Missing',
            GBPoints: '15',
            GBScoreType: 'Missing',
            GBNotes: ''
          }
        ]
      : [];
  return `<div id="AssignmentsGrid"></div><script>$("#AssignmentsGrid").dxDataGrid({"dataSource":${JSON.stringify(rows)},"paging":{"pageSize":20}})</script>`;
}

function successfulFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/PXP2_Login_Student.aspx' && method === 'GET') {
      return new Response(loginPage, {
        headers: { 'set-cookie': 'session=initial; Path=/; Secure; HttpOnly' }
      });
    }
    if (url.pathname === '/PXP2_Login_Student.aspx' && method === 'POST') {
      expect(String(init?.body)).toContain('ctl00%24MainContent%24username=student');
      expect(String(init?.body)).toContain('ctl00%24MainContent%24password=password');
      return new Response(null, {
        status: 302,
        headers: {
          location: '/Home_PXP2.aspx',
          'set-cookie': 'session=authenticated; Path=/; Secure; HttpOnly'
        }
      });
    }
    expect(new Headers(init?.headers).get('cookie')).toContain('session=authenticated');
    if (url.pathname === '/Home_PXP2.aspx') return new Response('<main>Dashboard</main>');
    if (url.pathname === '/PXP2_Gradebook.aspx') return new Response(gradebookPage);
    if (url.pathname === '/service/PXP2Communication.asmx/LoadControl') {
      const body = JSON.parse(String(init?.body)) as {
        request: { parameters: { classID: number } };
      };
      return Response.json({
        d: { Error: null, Data: { html: assignmentDetail(body.request.parameters.classID) } }
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe('StudentVUE web provider', () => {
  it('authenticates once and normalizes courses, grades, and assignments', async () => {
    const request = successfulFetch();
    const provider = new StudentVueWebProvider({
      baseUrl: 'https://studentvue.example.edu/untrusted/path',
      username: 'student',
      password: 'password',
      fetch: request,
      now: () => new Date('2026-08-10T16:00:00.000Z')
    });

    const [courses, grades, assignments, snapshot] = await Promise.all([
      provider.getCourses(),
      provider.getCourseGrades(),
      provider.getGradebookAssignments(),
      provider.getSnapshot()
    ]);

    expect(courses).toEqual([
      {
        id: 'studentvue:physics-course',
        externalIds: { studentVue: 'physics-course' },
        name: 'AP Physics 2',
        teacher: 'Dr. Ortega'
      },
      {
        id: 'studentvue:government-course',
        externalIds: { studentVue: 'government-course' },
        name: 'AP Government',
        teacher: 'Ms. Bennett'
      }
    ]);
    expect(grades).toEqual([
      expect.objectContaining({
        courseId: 'studentvue:physics-course',
        percentage: 91.8,
        letterGrade: 'A-'
      }),
      expect.objectContaining({
        courseId: 'studentvue:government-course',
        percentage: 94.2,
        letterGrade: 'A'
      })
    ]);
    expect(assignments).toEqual([
      expect.objectContaining({
        id: 'studentvue:assignment-1',
        title: 'Induction Quiz',
        pointsEarned: 17,
        pointsPossible: 20,
        percentage: 85,
        missing: false
      }),
      expect.objectContaining({
        id: 'studentvue:assignment-2',
        title: 'Lab Report',
        pointsPossible: 15,
        missing: true
      })
    ]);
    expect(snapshot).toMatchObject({ capturedAt: '2026-08-10T16:00:00.000Z' });
    expect(
      request.mock.calls.filter(([input]) => String(input).includes('Login_Student')).length
    ).toBe(2);
  });

  it('reports rejected credentials without exposing the response or password', async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if ((init?.method ?? 'GET') === 'GET') return new Response(loginPage);
      return new Response(loginPage);
    });
    const provider = new StudentVueWebProvider({
      baseUrl: 'https://studentvue.example.edu',
      username: 'student',
      password: 'private-password',
      fetch: request
    });

    await expect(provider.getCourses()).rejects.toThrow(
      'StudentVUE rejected the configured username or password'
    );
    await expect(provider.getCourses()).rejects.not.toThrow('private-password');
  });
});
