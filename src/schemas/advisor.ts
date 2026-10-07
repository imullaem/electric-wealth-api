import { IsoDateSchema, MeetingTypeSchema } from './common.js';
import { z } from './zod.js';

/** 24-hour start time, e.g. 14:30. */
const SlotTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM').openapi({ example: '14:30' });

export const AdvisorInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    designation: z.string().optional(),
    available: z.boolean(),
  })
  .openapi('AdvisorInfo');

export const AvailabilityDaySchema = z
  .object({
    date: IsoDateSchema,
    slots: z.array(SlotTimeSchema).openapi({ description: 'Open start times, Toronto time' }),
  })
  .openapi('AvailabilityDay');

export const AvailabilityResponseSchema = z
  .object({
    advisor: AdvisorInfoSchema,
    meetingTypes: z.array(MeetingTypeSchema),
    days: z.array(AvailabilityDaySchema).openapi({ description: 'The next five business days, starting tomorrow' }),
  })
  .openapi('AvailabilityResponse');

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

export const AppointmentStatusSchema = z.enum(['scheduled', 'completed', 'cancelled']).openapi('AppointmentStatus');

export const AppointmentSchema = z
  .object({
    id: z.string(),
    advisorId: z.string(),
    meetingType: MeetingTypeSchema,
    date: IsoDateSchema,
    time: SlotTimeSchema,
    status: AppointmentStatusSchema,
    notes: z.string().optional(),
  })
  .openapi('Appointment');

export type Appointment = z.infer<typeof AppointmentSchema>;

export const AppointmentsResponseSchema = z.array(AppointmentSchema).openapi('AppointmentsResponse');

export const AppointmentCreateRequestSchema = z
  .object({
    meetingType: MeetingTypeSchema,
    date: IsoDateSchema,
    time: SlotTimeSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .openapi('AppointmentCreateRequest');

export type AppointmentCreateRequest = z.infer<typeof AppointmentCreateRequestSchema>;

/** Reschedule (date and time together) or cancel. */
export const AppointmentPatchRequestSchema = z
  .object({
    date: IsoDateSchema.optional(),
    time: SlotTimeSchema.optional(),
    status: z.literal('cancelled').optional(),
  })
  .refine((p) => (p.date === undefined) === (p.time === undefined), {
    message: 'date and time must be changed together',
    path: ['time'],
  })
  .refine((p) => p.date !== undefined || p.status !== undefined, { message: 'Nothing to change' })
  .refine((p) => !(p.date !== undefined && p.status !== undefined), { message: 'Reschedule or cancel, not both' })
  .openapi('AppointmentPatchRequest');

export type AppointmentPatchRequest = z.infer<typeof AppointmentPatchRequestSchema>;

export const AppointmentIdParamsSchema = z.object({ id: z.string() });

export const AvailabilityQuerySchema = z.object({
  meetingType: MeetingTypeSchema.optional().openapi({ description: 'Accepted for v1 compatibility; every type has the same slots' }),
});

export const AdvisorMessageSchema = z
  .object({
    id: z.string(),
    from: z.enum(['advisor', 'client']),
    text: z.string(),
    at: z.iso.datetime(),
  })
  .openapi('AdvisorMessage');

export type AdvisorMessage = z.infer<typeof AdvisorMessageSchema>;

/** Oldest first. */
export const AdvisorMessagesResponseSchema = z.array(AdvisorMessageSchema).openapi('AdvisorMessagesResponse');

export const AdvisorMessageCreateRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
  })
  .openapi('AdvisorMessageCreateRequest');
