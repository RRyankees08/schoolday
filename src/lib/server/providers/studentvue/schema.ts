import { z } from 'zod';

const nullableNumber = z.number().nullable();

const gradebookItemSchema = z.object({
  item_id: z.string(),
  title: z.string(),
  points_earned: nullableNumber,
  points_possible: nullableNumber,
  percentage: nullableNumber,
  is_missing: z.boolean(),
  is_excused: z.boolean(),
  graded_at: z.string().nullable()
});

const studentVueCourseSchema = z.object({
  class_id: z.string(),
  course_title: z.string(),
  teacher_name: z.string().optional(),
  period: z.string().optional(),
  grade: z.object({
    percentage: nullableNumber,
    letter: z.string().nullable()
  }),
  assignments: z.array(gradebookItemSchema)
});

export const studentVueGradebookSchema = z.object({
  captured_at: z.string(),
  grading_period: z.string().optional(),
  courses: z.array(studentVueCourseSchema)
});

export type StudentVueGradebookFixture = z.infer<typeof studentVueGradebookSchema>;
