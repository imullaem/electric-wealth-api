import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { bearerToken, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry } from '../openapi/registry.js';
import { findUserByEmail, findUserById } from '../repositories/users.js';
import {
  createSession,
  findActiveSession,
  markMfaVerified,
  revokeSession,
  rotateSession,
  TOKEN_TTL_SECONDS,
} from '../repositories/sessions.js';
import {
  LogoutRequestSchema,
  MfaVerifyRequestSchema,
  MfaVerifyResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  TokenRequestSchema,
  TokenResponseSchema,
} from '../schemas/auth.js';

const tags = ['Auth'];

registry.registerPath({
  method: 'post',
  path: '/api/auth/token',
  tags,
  summary: 'Sign in with email and password',
  description: 'Returns a session that still requires MFA (`mfaRequired: true`). Call `/api/auth/mfa/verify` next.',
  request: { body: jsonBody(TokenRequestSchema) },
  responses: { 200: jsonBody(TokenResponseSchema, 'Session created; MFA required'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/mfa/verify',
  tags,
  summary: 'Complete MFA for the current session',
  description: 'Send the access token from `/api/auth/token` as a Bearer token. The demo code is `123456`.',
  request: { body: jsonBody(MfaVerifyRequestSchema) },
  responses: { 200: jsonBody(MfaVerifyResponseSchema, 'Session is now MFA-verified'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags,
  summary: 'Exchange a refresh token for a new session',
  request: { body: jsonBody(RefreshRequestSchema) },
  responses: { 200: jsonBody(RefreshResponseSchema, 'New tokens'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags,
  summary: 'Revoke the current session',
  request: { body: jsonBody(LogoutRequestSchema) },
  responses: { 204: { description: 'Signed out' } },
});

export function createAuthRouter(db: Db) {
  const router = Router();

  router.post('/token', (req, res) => {
    const body = parseOr400(TokenRequestSchema, req.body, req, res);
    if (!body) return;
    const user = findUserByEmail(db, body.username);
    if (!user || user.password !== body.password) {
      sendError(req, res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
      return;
    }
    const session = createSession(db, user.id, false);
    res.json(
      TokenResponseSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: 'Bearer',
        expiresIn: TOKEN_TTL_SECONDS,
        mfaRequired: true,
      }),
    );
  });

  router.post('/mfa/verify', (req, res) => {
    const body = parseOr400(MfaVerifyRequestSchema, req.body, req, res);
    if (!body) return;
    const token = bearerToken(req);
    const session = token ? findActiveSession(db, token) : undefined;
    if (!session) {
      sendError(req, res, 401, 'UNAUTHORIZED', 'Access token is missing or expired.');
      return;
    }
    const user = findUserById(db, session.userId);
    if (!user || body.code !== user.mfaCode) {
      sendError(req, res, 401, 'INVALID_MFA', 'Invalid MFA code.');
      return;
    }
    const verified = markMfaVerified(db, session.accessToken)!;
    res.json(MfaVerifyResponseSchema.parse({ accessToken: verified.accessToken, expiresIn: TOKEN_TTL_SECONDS }));
  });

  router.post('/refresh', (req, res) => {
    const body = parseOr400(RefreshRequestSchema, req.body, req, res);
    if (!body) return;
    const session = rotateSession(db, body.refreshToken);
    if (!session) {
      sendError(req, res, 401, 'INVALID_REFRESH', 'Refresh token is invalid or expired.');
      return;
    }
    res.json(
      RefreshResponseSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: 'Bearer',
        expiresIn: TOKEN_TTL_SECONDS,
      }),
    );
  });

  router.post('/logout', (req, res) => {
    const parsed = LogoutRequestSchema.safeParse(req.body ?? {});
    revokeSession(db, {
      accessToken: bearerToken(req),
      refreshToken: parsed.success ? parsed.data.refreshToken : undefined,
    });
    res.status(204).send();
  });

  return router;
}
