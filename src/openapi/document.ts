import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.js';
// Importing the route modules registers their paths with the registry.
import '../routes/index.js';

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Electric Wealth API',
      version: '0.1.0',
      description:
        'REST API for the Electric Wealth web app. Money values are integers in minor units (cents). ' +
        'Errors use the ErrorEnvelope shape. Demo sign-in: any persona email, password `Demo123!`, MFA code `123456`.',
    },
    servers: [{ url: 'http://localhost:4100', description: 'Local development' }],
  });
}
