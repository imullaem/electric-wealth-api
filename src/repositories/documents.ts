import { opt, pageClause, toBool, type Db } from '../db/connection.js';
import type { Document } from '../schemas/documents.js';

interface DocumentRow {
  id: string;
  name: string;
  category: string;
  year: number;
  account_id: string | null;
  account_label: string | null;
  size_bytes: number;
  action_required: number;
  url: string;
}

const toDocument = (r: DocumentRow): Document => ({
  id: r.id,
  name: r.name,
  category: r.category,
  year: r.year,
  accountId: r.account_id,
  accountLabel: opt(r.account_label),
  sizeBytes: r.size_bytes,
  actionRequired: toBool(r.action_required),
  url: r.url,
});

export function listDocuments(
  db: Db,
  userId: string,
  opts: { page: number; pageSize: number; year?: number; category?: string },
) {
  const clauses = ['user_id = ?'];
  const params: (string | number)[] = [userId];
  if (opts.year !== undefined) {
    clauses.push('year = ?');
    params.push(opts.year);
  }
  if (opts.category) {
    clauses.push('category = ?');
    params.push(opts.category);
  }
  const where = clauses.join(' AND ');
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM documents WHERE ${where}`).get(...params) as {
    total: number;
  };
  const limit = pageClause(opts.page, opts.pageSize);
  const rows = db
    .prepare(`SELECT * FROM documents WHERE ${where} ORDER BY year DESC, action_required DESC, id ${limit.sql}`)
    .all(...params, ...limit.params) as unknown as DocumentRow[];
  return { items: rows.map(toDocument), total };
}

export function findDocument(db: Db, userId: string, documentId: string): Document | undefined {
  const row = db.prepare('SELECT * FROM documents WHERE user_id = ? AND id = ?').get(userId, documentId) as
    | DocumentRow
    | undefined;
  return row && toDocument(row);
}

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Records a 7-day share of a document with someone by email. Returns the expiry time. */
export function shareDocument(db: Db, userId: string, documentId: string, recipient: string): string {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SHARE_TTL_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare(
    `INSERT INTO document_shares (user_id, document_id, recipient, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, documentId, recipient, now.toISOString().replace(/\.\d{3}Z$/, 'Z'), expiresAt);
  return expiresAt;
}
