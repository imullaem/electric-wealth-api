import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400 } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import { createGoal, listGoals } from '../repositories/goals.js';
import { PaginationQuerySchema } from '../schemas/common.js';
import { GoalCreateRequestSchema, GoalSchema, GoalsListResponseSchema } from '../schemas/goals.js';

registry.registerPath({
  method: 'get',
  path: '/api/wealth/goals',
  tags: ['Goals'],
  summary: 'List savings goals',
  security: secured,
  request: { query: PaginationQuerySchema },
  responses: { 200: jsonBody(GoalsListResponseSchema, 'Goals'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/wealth/goals',
  tags: ['Goals'],
  summary: 'Create a savings goal',
  security: secured,
  request: { body: jsonBody(GoalCreateRequestSchema) },
  responses: { 201: jsonBody(GoalSchema, 'Created goal'), ...errors(400, 401) },
});

/** Mounted at /api/wealth/goals. */
export function createGoalsRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/', (req, res) => {
    const query = parseOr400(PaginationQuerySchema, req.query, req, res);
    if (!query) return;
    const { items, total } = listGoals(db, req.userId!, query.page, query.pageSize);
    res.json(GoalsListResponseSchema.parse({ items, total, page: query.page, pageSize: query.pageSize }));
  });

  router.post('/', (req, res) => {
    const body = parseOr400(GoalCreateRequestSchema, req.body, req, res);
    if (!body) return;
    res.status(201).json(GoalSchema.parse(createGoal(db, req.userId!, body)));
  });

  return router;
}
