// The OpenAPI registry. Each routes file registers its paths here, right next to the handler,
// so the spec and the implementation are edited together.
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';
import { ErrorEnvelopeSchema } from '../schemas/error.js';

export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'Access token from POST /api/auth/token, after POST /api/auth/mfa/verify.',
});

/** Security requirement for protected endpoints. */
export const secured = [{ [bearerAuth.name]: [] }];

export const jsonBody = (schema: ZodType, description = 'JSON body') => ({
  description,
  content: { 'application/json': { schema } },
});

const errorDescriptions: Record<number, string> = {
  400: 'Validation error',
  401: 'Missing, expired or not MFA-verified access token',
  404: 'Resource not found',
  409: 'Conflicts with the current state (e.g. the slot was just taken)',
  429: 'Rate limited',
};

/** Standard error responses, all using the ErrorEnvelope shape. */
export const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [c, jsonBody(ErrorEnvelopeSchema, errorDescriptions[c] ?? 'Error')]));
