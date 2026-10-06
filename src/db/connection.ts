import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDatabase(dbPath: string): Db {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}.\n` +
        'Build it first: cd ../electric-wealth-db && npm run db:reset\n' +
        '(or set DB_PATH in .env to point at an existing database file)',
    );
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 3000;');
  return db;
}

/** SQLite has no boolean type; columns store 0/1. */
export const toBool = (v: unknown): boolean => v === 1 || v === true;

/** Converts SQL NULL to undefined for optional (not nullable) API fields. */
export const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Builds a LIMIT/OFFSET clause and bindings from 1-based paging. */
export const pageClause = (page: number, pageSize: number) => ({
  sql: 'LIMIT ? OFFSET ?',
  params: [pageSize, (page - 1) * pageSize] as const,
});
