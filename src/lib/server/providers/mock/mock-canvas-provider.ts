import assignments from '../../../../../fixtures/canvas/assignments.json';
import calendarEvents from '../../../../../fixtures/canvas/calendar-events.json';
import courses from '../../../../../fixtures/canvas/courses.json';
import submissions from '../../../../../fixtures/canvas/submissions.json';
import type { CanvasProvider } from '../contracts';
import {
  normalizeCanvasAssignments,
  normalizeCanvasCalendarEvents,
  normalizeCanvasCourses,
  normalizeCanvasSubmissions
} from '../canvas/normalize';
import { canvasFixtureSchema } from '../canvas/schema';

export class MockCanvasProvider implements CanvasProvider {
  private readonly fixture = canvasFixtureSchema.parse({
    courses,
    assignments,
    submissions,
    calendarEvents
  });

  async getCourses() {
    return normalizeCanvasCourses(this.fixture.courses);
  }

  async getAssignments() {
    return normalizeCanvasAssignments(this.fixture.assignments, this.fixture.submissions);
  }

  async getSubmissions() {
    return normalizeCanvasSubmissions(this.fixture.submissions);
  }

  async getCalendarEvents() {
    return normalizeCanvasCalendarEvents(this.fixture.calendarEvents);
  }
}
