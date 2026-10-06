import { z } from './zod.js';

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'NOT_FOUND' }),
      message: z.string(),
      traceId: z.string(),
    }),
  })
  .openapi('ErrorEnvelope');

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const HealthResponseSchema = z.object({ status: z.literal('ok') }).openapi('HealthResponse');
