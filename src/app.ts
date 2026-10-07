import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import type { Db } from './db/connection.js';
import {
  errorHandler,
  languageMiddleware,
  notFoundHandler,
  rateLimitMiddleware,
  requestLogMiddleware,
  traceMiddleware,
} from './middleware/index.js';
import { buildOpenApiDocument } from './openapi/document.js';
import {
  createAuthRouter,
  createGoalsRouter,
  createNotificationsRouter,
  createPreferencesRouter,
  createProfileRouter,
  createWealthRouter,
} from './routes/index.js';

export interface AppOptions {
  db: Db;
  corsOrigins?: string[];
  logRequests?: boolean;
}

export function createApp({ db, corsOrigins = [], logRequests = true }: AppOptions) {
  const app = express();
  const openApiDocument = buildOpenApiDocument();

  app.use(cors({ origin: corsOrigins, exposedHeaders: ['X-Trace-Id'] }));
  app.use(express.json());
  app.use(traceMiddleware);
  if (logRequests) app.use(requestLogMiddleware);
  app.use(languageMiddleware);
  app.use(rateLimitMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/wealth/goals', createGoalsRouter(db));
  app.use('/api/wealth', createWealthRouter(db));
  app.use('/api/profile', createProfileRouter(db));
  app.use('/api/preferences', createPreferencesRouter(db));
  app.use('/api/notifications', createNotificationsRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
