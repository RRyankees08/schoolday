import { z } from 'zod';

const canvasTeacherSchema = z.object({
  id: z.number().optional(),
  display_name: z.string().optional(),
  name: z.string().optional()
});

export const canvasCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  course_code: z.string(),
  teacher: z.string().optional(),
  teachers: z.array(canvasTeacherSchema).optional()
});

export const canvasSubmissionSchema = z.object({
  id: z.number().optional(),
  assignment_id: z.number(),
  workflow_state: z.string(),
  submitted_at: z.string().nullable(),
  late: z.boolean().optional(),
  missing: z.boolean().optional(),
  graded: z.boolean().optional(),
  graded_at: z.string().nullable().optional(),
  grade: z.union([z.string(), z.number()]).nullable().optional(),
  score: z.number().nullable().optional()
});

export const canvasAssignmentSchema = z.object({
  id: z.number(),
  course_id: z.number(),
  name: z.string(),
  due_at: z.string().nullable(),
  points_possible: z.number().nullable().optional(),
  html_url: z.url().optional(),
  submission: canvasSubmissionSchema.nullable().optional()
});

export const canvasCalendarEventSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  start_at: z.string(),
  end_at: z.string().nullable().optional(),
  course_id: z.number().optional(),
  context_code: z.string().optional(),
  html_url: z.url().optional()
});

export const canvasFixtureSchema = z.object({
  courses: z.array(canvasCourseSchema),
  assignments: z.array(canvasAssignmentSchema),
  submissions: z.array(canvasSubmissionSchema),
  calendarEvents: z.array(canvasCalendarEventSchema)
});

export type CanvasCourseRecord = z.infer<typeof canvasCourseSchema>;
export type CanvasAssignmentRecord = z.infer<typeof canvasAssignmentSchema>;
export type CanvasSubmissionRecord = z.infer<typeof canvasSubmissionSchema>;
export type CanvasCalendarEventRecord = z.infer<typeof canvasCalendarEventSchema>;
export type CanvasFixture = z.infer<typeof canvasFixtureSchema>;
