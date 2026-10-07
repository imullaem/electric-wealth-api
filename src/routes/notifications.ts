import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../repositories/notifications.js';
import {
  NotificationIdParamsSchema,
  NotificationReadResponseSchema,
  NotificationsReadAllResponseSchema,
  NotificationsResponseSchema,
} from '../schemas/notifications.js';

registry.registerPath({
  method: 'get',
  path: '/api/notifications',
  tags: ['Notifications'],
  summary: 'All notifications, newest first',
  security: secured,
  responses: { 200: jsonBody(NotificationsResponseSchema, 'Notifications'), ...errors(401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/notifications/{id}/read',
  tags: ['Notifications'],
  summary: 'Mark one notification as read',
  security: secured,
  request: { params: NotificationIdParamsSchema },
  responses: { 200: jsonBody(NotificationReadResponseSchema, 'Marked as read'), ...errors(401, 404) },
});

registry.registerPath({
  method: 'post',
  path: '/api/notifications/read-all',
  tags: ['Notifications'],
  summary: 'Mark every notification as read',
  security: secured,
  responses: { 200: jsonBody(NotificationsReadAllResponseSchema, 'Marked as read'), ...errors(401) },
});

export function createNotificationsRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/', (req, res) => {
    res.json(NotificationsResponseSchema.parse(listNotifications(db, req.userId!)));
  });

  // Registered before '/:id/read' so "read-all" is never taken as an id.
  router.post('/read-all', (req, res) => {
    res.json(NotificationsReadAllResponseSchema.parse({ updated: markAllNotificationsRead(db, req.userId!) }));
  });

  router.post('/:id/read', (req, res) => {
    const params = parseOr400(NotificationIdParamsSchema, req.params, req, res);
    if (!params) return;
    if (!markNotificationRead(db, req.userId!, params.id)) {
      sendError(req, res, 404, 'NOT_FOUND', 'Notification not found.');
      return;
    }
    res.json(NotificationReadResponseSchema.parse({ id: params.id, read: true }));
  });

  return router;
}
