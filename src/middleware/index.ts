import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { Db } from '../db/connection.js';
import { findActiveSession } from '../repositories/sessions.js';
import type { ErrorEnvelope } from '../schemas/error.js';

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      userId?: string;
      accessToken?: string;
      language: 'en-CA' | 'fr-CA';
    }
  }
}

const newTraceId = () => `trace-${randomUUID().slice(0, 8)}`;

export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.traceId = newTraceId();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
}

export function languageMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.language = req.header('Accept-Language')?.startsWith('fr') ? 'fr-CA' : 'en-CA';
  next();
}

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms trace=${req.traceId}`);
  });
  next();
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 300;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  let bucket = requestCounts.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    requestCounts.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    sendError(req, res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    return;
  }
  next();
}

export function bearerToken(req: Request): string | undefined {
  const header = req.header('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Requires a valid, MFA-verified access token. Sets req.userId. */
export function authMiddleware(db: Db): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req);
    const session = token ? findActiveSession(db, token) : undefined;
    if (!session || !session.mfaVerified) {
      sendError(req, res, 401, 'UNAUTHORIZED', 'Access token is missing or expired.');
      return;
    }
    req.userId = session.userId;
    req.accessToken = token;
    next();
  };
}

export function sendError(req: Request, res: Response, status: number, code: string, message: string): void {
  const body: ErrorEnvelope = { error: { code, message, traceId: req.traceId ?? newTraceId() } };
  res.status(status).json(body);
}

/**
 * Validates input against a Zod schema. On failure sends a 400 VALIDATION_ERROR and returns undefined,
 * so handlers can write: `const body = parseOr400(Schema, req.body, req, res); if (!body) return;`
 */
export function parseOr400<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  req: Request,
  res: Response,
): z.infer<S> | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    sendError(req, res, 400, 'VALIDATION_ERROR', `Invalid request. ${detail}`);
    return undefined;
  }
  return result.data;
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(req, res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[trace=${req.traceId}]`, err);
  sendError(req, res, 500, 'INTERNAL_ERROR', 'Something went wrong.');
}

const FR_LABELS: Record<string, string> = {
  'Open account': 'Ouvrir un compte',
  Documents: 'Documents',
  Research: 'Recherche',
  'Book advisor': 'Prendre rendez-vous',
  'Call advisor': 'Appeler votre conseiller',
  'Tax documents': 'Documents fiscaux',
  'RESP contributions': 'Cotisations REEE',
  'Start investing': 'Commencer à investir',
  'Learn basics': 'Apprendre les bases',
  'Advanced analytics': 'Analyses avancées',
  'Private markets': 'Marchés privés',
};

/** Server-side labels (e.g. dashboard quick links) are localized from Accept-Language. */
export function localizeLabel(label: string, language: 'en-CA' | 'fr-CA'): string {
  return language === 'fr-CA' ? (FR_LABELS[label] ?? label) : label;
}
