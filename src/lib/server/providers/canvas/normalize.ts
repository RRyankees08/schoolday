import type { Assignment, CalendarEvent, Course, Submission, SubmissionState } from '$lib/models';
import type {
  CanvasAssignmentRecord,
  CanvasCalendarEventRecord,
  CanvasCourseRecord,
  CanvasSubmissionRecord
} from './schema';

function submissionState(submission: CanvasSubmissionRecord | undefined): SubmissionState {
  if (!submission) return 'not_submitted';
  if (submission.missing) return 'missing';
  if (submission.late) return 'late';
  if (
    submission.graded ||
    submission.workflow_state === 'graded' ||
    submission.graded_at ||
    (submission.grade !== null && submission.grade !== undefined) ||
    (submission.score !== null && submission.score !== undefined)
  ) {
    return 'graded';
  }
  if (submission.submitted_at || submission.workflow_state === 'submitted') return 'submitted';
  return 'not_submitted';
}

function courseTeacher(course: CanvasCourseRecord): string | undefined {
  if (course.teacher) return course.teacher;
  const names = course.teachers
    ?.map((teacher) => teacher.display_name ?? teacher.name)
    .filter((name): name is string => Boolean(name));
  return names?.length ? names.join(', ') : undefined;
}

export function normalizeCanvasCourses(raw: CanvasCourseRecord[]): Course[] {
  return raw.map((course) => ({
    id: `canvas:${course.id}`,
    externalIds: { canvas: String(course.id) },
    name: course.name,
    shortName: course.course_code,
    teacher: courseTeacher(course)
  }));
}

export function normalizeCanvasAssignments(
  rawAssignments: CanvasAssignmentRecord[],
  rawSubmissions: CanvasSubmissionRecord[]
): Assignment[] {
  const submissions = new Map(
    rawSubmissions.map((submission) => [submission.assignment_id, submission] as const)
  );

  return rawAssignments.map((assignment) => {
    const submission = submissions.get(assignment.id);
    const state = submissionState(submission);

    return {
      id: `canvas:${assignment.id}`,
      courseId: `canvas:${assignment.course_id}`,
      title: assignment.name,
      dueAt: assignment.due_at,
      pointsPossible: assignment.points_possible ?? undefined,
      submitted: state === 'submitted' || state === 'late' || state === 'graded',
      submissionState: state,
      source: 'canvas',
      externalUrl: assignment.html_url
    };
  });
}

export function normalizeCanvasSubmissions(raw: CanvasSubmissionRecord[]): Submission[] {
  return raw.map((submission) => ({
    id: `canvas:${submission.id ?? submission.assignment_id}`,
    assignmentId: `canvas:${submission.assignment_id}`,
    submittedAt: submission.submitted_at ?? undefined,
    state: submissionState(submission)
  }));
}

export function normalizeCanvasCalendarEvents(raw: CanvasCalendarEventRecord[]): CalendarEvent[] {
  return raw.map((event) => ({
    id: `canvas:${event.id}`,
    title: event.title,
    startAt: event.start_at,
    endAt: event.end_at ?? undefined,
    courseId: canvasEventCourseId(event),
    externalUrl: event.html_url
  }));
}

function canvasEventCourseId(event: CanvasCalendarEventRecord): string | undefined {
  if (event.course_id) return `canvas:${event.course_id}`;
  const match = /^course_(\d+)$/.exec(event.context_code ?? '');
  return match ? `canvas:${match[1]}` : undefined;
}
