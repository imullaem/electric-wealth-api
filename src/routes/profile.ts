import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import { findPreferences, findProfile, updatePreferences } from '../repositories/profile.js';
import { PreferencesResponseSchema, PreferencesUpdateSchema, ProfileResponseSchema } from '../schemas/profile.js';

registry.registerPath({
  method: 'get',
  path: '/api/profile',
  tags: ['Profile'],
  summary: 'Signed-in user profile',
  security: secured,
  responses: { 200: jsonBody(ProfileResponseSchema, 'Profile'), ...errors(401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/preferences',
  tags: ['Profile'],
  summary: 'Signed-in user preferences',
  security: secured,
  responses: { 200: jsonBody(PreferencesResponseSchema, 'Preferences'), ...errors(401, 404) },
});

registry.registerPath({
  method: 'put',
  path: '/api/preferences',
  tags: ['Profile'],
  summary: 'Update preferences (partial update)',
  security: secured,
  request: { body: jsonBody(PreferencesUpdateSchema) },
  responses: { 200: jsonBody(PreferencesResponseSchema, 'Updated preferences'), ...errors(400, 401, 404) },
});

export function createProfileRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/', (req, res) => {
    const profile = findProfile(db, req.userId!);
    if (!profile) {
      sendError(req, res, 404, 'NOT_FOUND', 'Profile not found.');
      return;
    }
    res.json(ProfileResponseSchema.parse(profile));
  });

  return router;
}

export function createPreferencesRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/', (req, res) => {
    const prefs = findPreferences(db, req.userId!);
    if (!prefs) {
      sendError(req, res, 404, 'NOT_FOUND', 'Preferences not found.');
      return;
    }
    res.json(PreferencesResponseSchema.parse(prefs));
  });

  router.put('/', (req, res) => {
    const update = parseOr400(PreferencesUpdateSchema, req.body, req, res);
    if (!update) return;
    updatePreferences(db, req.userId!, update);
    const prefs = findPreferences(db, req.userId!);
    if (!prefs) {
      sendError(req, res, 404, 'NOT_FOUND', 'Preferences not found.');
      return;
    }
    res.json(PreferencesResponseSchema.parse(prefs));
  });

  return router;
}
