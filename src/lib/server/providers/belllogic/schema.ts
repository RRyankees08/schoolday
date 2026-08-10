import { z } from 'zod';

const hhmmSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((value) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }, 'Invalid 24-hour time');

const bellLogicApiPeriodSchema = z
  .object({
    name: z.string().min(1),
    start: hhmmSchema,
    end: hhmmSchema
  })
  .refine((period) => period.start < period.end, {
    message: 'Period end must be after its start'
  });

export const bellLogicApiScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string().nullable(),
  periods: z.array(bellLogicApiPeriodSchema),
  isOverride: z.boolean(),
  tomorrow: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.string().nullable()
    })
    .optional()
});

export const bellLogicApiStateSchema = z.object({
  school: z.object({
    name: z.string().min(1),
    timeZone: z.literal('America/Phoenix')
  }),
  serverTime: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid server time'
  }),
  schedule: bellLogicApiScheduleSchema
});

export const bellLogicApiResponseSchema = z.union([
  bellLogicApiStateSchema,
  bellLogicApiScheduleSchema
]);

export const bellLogicScheduleSchema = z.object({
  schedule_id: z.string(),
  schedule_name: z.string(),
  day_type: z.string(),
  is_school_day: z.boolean(),
  periods: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      starts: hhmmSchema,
      ends: hhmmSchema
    })
  )
});

export type BellLogicApiSchedule = z.infer<typeof bellLogicApiScheduleSchema>;
export type BellLogicApiResponse = z.infer<typeof bellLogicApiResponseSchema>;
export type BellLogicScheduleFixture = z.infer<typeof bellLogicScheduleSchema>;
