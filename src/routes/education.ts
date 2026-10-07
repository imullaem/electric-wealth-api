import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import {
  educationContentExists,
  listEducationContent,
  saveEducationProgress,
  searchGlossary,
} from '../repositories/education.js';
import { LanguageSchema } from '../schemas/common.js';
import {
  EducationContentQuerySchema,
  EducationContentResponseSchema,
  EducationProgressRequestSchema,
  EducationProgressResponseSchema,
  GlossaryQuerySchema,
  GlossaryResponseSchema,
} from '../schemas/education.js';
import { z } from '../schemas/zod.js';

const languageHeader = z.object({ 'accept-language': LanguageSchema.optional() });

registry.registerPath({
  method: 'get',
  path: '/api/education/content',
  tags: ['Education'],
  summary: 'Learning centre catalogue with the user’s progress',
  security: secured,
  request: { query: EducationContentQuerySchema, headers: languageHeader },
  responses: { 200: jsonBody(EducationContentResponseSchema, 'Classes and challenges'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'get',
  path: '/api/education/glossary',
  tags: ['Education'],
  summary: 'Financial glossary, A to Z, optionally filtered',
  security: secured,
  request: { query: GlossaryQuerySchema, headers: languageHeader },
  responses: { 200: jsonBody(GlossaryResponseSchema, 'Glossary entries'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/education/progress',
  tags: ['Education'],
  summary: 'Save progress on a class or challenge',
  security: secured,
  request: { body: jsonBody(EducationProgressRequestSchema) },
  responses: { 200: jsonBody(EducationProgressResponseSchema, 'Saved progress'), ...errors(400, 401, 404) },
});

export function createEducationRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/content', (req, res) => {
    const query = parseOr400(EducationContentQuerySchema, req.query, req, res);
    if (!query) return;
    res.json(EducationContentResponseSchema.parse(listEducationContent(db, req.userId!, req.language, query)));
  });

  router.get('/glossary', (req, res) => {
    const query = parseOr400(GlossaryQuerySchema, req.query, req, res);
    if (!query) return;
    res.json(GlossaryResponseSchema.parse(searchGlossary(db, req.language, query.q)));
  });

  router.post('/progress', (req, res) => {
    const body = parseOr400(EducationProgressRequestSchema, req.body, req, res);
    if (!body) return;
    if (!educationContentExists(db, body.contentId)) {
      sendError(req, res, 404, 'NOT_FOUND', 'Content not found.');
      return;
    }
    saveEducationProgress(db, req.userId!, body.contentId, body.progressPct);
    res.json(EducationProgressResponseSchema.parse(body));
  });

  return router;
}
