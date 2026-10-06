import { MfaMethodSchema } from './common.js';
import { z } from './zod.js';

export const TokenRequestSchema = z
  .object({
    grantType: z.literal('password'),
    username: z.email().openapi({ example: 'sarah.chen@example.com' }),
    password: z.string().min(1).openapi({ example: 'Demo123!' }),
  })
  .openapi('TokenRequest');

export type TokenRequest = z.infer<typeof TokenRequestSchema>;

export const TokenResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.literal(900),
    mfaRequired: z.boolean(),
  })
  .openapi('TokenResponse');

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const MfaVerifyRequestSchema = z
  .object({
    challengeId: z.string().openapi({ description: 'Opaque challenge id (the demo accepts any value)' }),
    code: z.string().openapi({ example: '123456' }),
    method: MfaMethodSchema,
  })
  .openapi('MfaVerifyRequest');

export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const MfaVerifyResponseSchema = z
  .object({
    accessToken: z.string(),
    expiresIn: z.literal(900),
  })
  .openapi('MfaVerifyResponse');

export type MfaVerifyResponse = z.infer<typeof MfaVerifyResponseSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string() }).openapi('RefreshRequest');

export const RefreshResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.literal(900),
  })
  .openapi('RefreshResponse');

export const LogoutRequestSchema = z.object({ refreshToken: z.string().optional() }).openapi('LogoutRequest');
