// Single place where Zod is extended with `.openapi()` metadata.
// Every schema file imports `z` from here so the extension is always applied first.
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };
