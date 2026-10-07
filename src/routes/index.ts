import { jsonBody, registry } from '../openapi/registry.js';
import { HealthResponseSchema } from '../schemas/error.js';

export { createAdvisorRouter } from './advisor.js';
export { createAuthRouter } from './auth.js';
export { createEducationRouter } from './education.js';
export { createGoalsRouter } from './goals.js';
export { createNotificationsRouter } from './notifications.js';
export { createPreferencesRouter, createProfileRouter } from './profile.js';
export { createWealthRouter } from './wealth.js';

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness check',
  responses: { 200: jsonBody(HealthResponseSchema, 'Service is up') },
});
