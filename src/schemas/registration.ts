import { IsoDateSchema } from './common.js';
import { z } from './zod.js';

const RegistrationIdSchema = z.string().openapi({ example: 'reg-1a2b3c4d' });

export const PasswordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a number');

export const RegistrationStartRequestSchema = z
  .object({
    email: z.email().max(254),
    password: PasswordSchema,
  })
  .openapi('RegistrationStartRequest');

export const RegistrationStartResponseSchema = z
  .object({
    registrationId: RegistrationIdSchema,
    expiresAt: z.iso.datetime().openapi({ description: 'Finish every step before this time (30 minutes)' }),
  })
  .openapi('RegistrationStartResponse');

export const VerifyIdentityRequestSchema = z
  .object({
    registrationId: RegistrationIdSchema,
    accountNumber: z.string().trim().regex(/^\d{10}$/, 'Must be the 10-digit account number'),
    postalCode: z.string().trim().max(7),
    dateOfBirth: IsoDateSchema,
  })
  .openapi('VerifyIdentityRequest');

export const VerifyIdentityResponseSchema = z
  .object({
    verified: z.literal(true),
    name: z.string().openapi({ description: 'The client name on file, to confirm the right record was found' }),
  })
  .openapi('VerifyIdentityResponse');

export const SecurityQuestionSchema = z.object({ id: z.string(), text: z.string() }).openapi('SecurityQuestion');

export const SecurityQuestionsResponseSchema = z.array(SecurityQuestionSchema).openapi('SecurityQuestionsResponse');

export const SecurityAnswersRequestSchema = z
  .object({
    registrationId: RegistrationIdSchema,
    answers: z
      .array(z.object({ questionId: z.string(), answer: z.string().trim().min(2).max(100) }))
      .length(2, 'Answer exactly two questions')
      .refine((a) => a[0]?.questionId !== a[1]?.questionId, 'Choose two different questions'),
  })
  .openapi('SecurityAnswersRequest');

export const TrustedContactRequestSchema = z
  .object({
    registrationId: RegistrationIdSchema,
    name: z.string().trim().min(1).max(80),
    relationship: z.string().trim().min(1).max(40),
    phone: z.string().trim().max(30).optional(),
    email: z.email().optional(),
  })
  .openapi('TrustedContactRequest');

export const RegistrationCompleteRequestSchema = z
  .object({
    registrationId: RegistrationIdSchema,
    mfaMethod: z.enum(['sms', 'email']).openapi({ description: 'Where one-time sign-in codes are sent' }),
    consents: z.object({
      terms: z.literal(true),
      privacy: z.literal(true),
      electronicDelivery: z.literal(true),
    }),
  })
  .openapi('RegistrationCompleteRequest');

export type RegistrationCompleteRequest = z.infer<typeof RegistrationCompleteRequestSchema>;

export const StepSavedResponseSchema = z.object({ saved: z.literal(true) }).openapi('StepSavedResponse');
