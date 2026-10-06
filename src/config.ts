import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root is one level up from src/ (dev) or dist/ (build).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present (Node's built-in loader; no dotenv dependency).
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  port: Number(process.env.PORT) || 4100,
  /** Defaults to the sibling electric-wealth-db repo's database file. */
  dbPath: resolve(repoRoot, process.env.DB_PATH ?? '../electric-wealth-db/data/electric-wealth.db'),
  /** Comma-separated list of allowed browser origins. */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
};
