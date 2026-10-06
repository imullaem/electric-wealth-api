// Generates openapi.json from the Zod schemas and route registrations.
//   npm run gen:openapi     write openapi.json
//   npm run check:openapi   fail if openapi.json is out of date (run in CI / before committing)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../src/openapi/document.js';

const specPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
const generated = JSON.stringify(buildOpenApiDocument(), null, 2) + '\n';

if (process.argv.includes('--check')) {
  const committed = existsSync(specPath) ? readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n') : '';
  if (committed !== generated) {
    console.error('openapi.json is out of date with the Zod schemas / routes.');
    console.error('Run "npm run gen:openapi" and commit the result.');
    process.exit(1);
  }
  console.log('openapi.json is up to date.');
} else {
  writeFileSync(specPath, generated);
  const paths = Object.keys(buildOpenApiDocument().paths ?? {}).length;
  console.log(`Wrote ${specPath} (${paths} paths).`);
}
