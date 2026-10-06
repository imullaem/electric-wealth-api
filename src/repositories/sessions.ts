import { randomUUID } from 'node:crypto';
import { toBool, type Db } from '../db/connection.js';

export const TOKEN_TTL_SECONDS = 900;

export interface SessionRecord {
  accessToken: string;
  refreshToken: string;
  userId: string;
  mfaVerified: boolean;
  expiresAt: string;
}

interface SessionRow {
  access_token: string;
  refresh_token: string;
  user_id: string;
  mfa_verified: number;
  revoked: number;
  expires_at: string;
}

const toSession = (r: SessionRow): SessionRecord => ({
  accessToken: r.access_token,
  refreshToken: r.refresh_token,
  userId: r.user_id,
  mfaVerified: toBool(r.mfa_verified),
  expiresAt: r.expires_at,
});

const expiryFromNow = () => new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

export function createSession(db: Db, userId: string, mfaVerified = false): SessionRecord {
  const session: SessionRecord = {
    accessToken: `mock-at-${randomUUID()}`,
    refreshToken: `mock-rt-${randomUUID()}`,
    userId,
    mfaVerified,
    expiresAt: expiryFromNow(),
  };
  db.prepare(
    `INSERT INTO sessions (access_token, refresh_token, user_id, mfa_verified, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(session.accessToken, session.refreshToken, userId, mfaVerified ? 1 : 0, session.expiresAt, new Date().toISOString());
  return session;
}

/** Returns the session for an access token if it exists, is not revoked and has not expired. */
export function findActiveSession(db: Db, accessToken: string): SessionRecord | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE access_token = ?').get(accessToken) as SessionRow | undefined;
  if (!row || toBool(row.revoked) || new Date(row.expires_at) <= new Date()) return undefined;
  return toSession(row);
}

export function markMfaVerified(db: Db, accessToken: string): SessionRecord | undefined {
  db.prepare('UPDATE sessions SET mfa_verified = 1, expires_at = ? WHERE access_token = ? AND revoked = 0').run(
    expiryFromNow(),
    accessToken,
  );
  return findActiveSession(db, accessToken);
}

/** Exchanges a refresh token for a new session, revoking the old one (refresh-token rotation). */
export function rotateSession(db: Db, refreshToken: string): SessionRecord | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE refresh_token = ? AND revoked = 0').get(refreshToken) as
    | SessionRow
    | undefined;
  if (!row) return undefined;
  db.prepare('UPDATE sessions SET revoked = 1 WHERE access_token = ?').run(row.access_token);
  return createSession(db, row.user_id, toBool(row.mfa_verified));
}

export function revokeSession(db: Db, tokens: { accessToken?: string; refreshToken?: string }): void {
  if (tokens.accessToken) db.prepare('UPDATE sessions SET revoked = 1 WHERE access_token = ?').run(tokens.accessToken);
  if (tokens.refreshToken) db.prepare('UPDATE sessions SET revoked = 1 WHERE refresh_token = ?').run(tokens.refreshToken);
}
