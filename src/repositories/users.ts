import type { Db } from '../db/connection.js';

export interface UserRecord {
  id: string;
  email: string;
  password: string;
  mfaCode: string;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
  password: string;
  mfa_code: string;
  name: string;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  password: r.password,
  mfaCode: r.mfa_code,
  name: r.name,
});

export function findUserByEmail(db: Db, email: string): UserRecord | undefined {
  const row = db.prepare('SELECT id, email, password, mfa_code, name FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;
  return row && toUser(row);
}

export function findUserById(db: Db, id: string): UserRecord | undefined {
  const row = db.prepare('SELECT id, email, password, mfa_code, name FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row && toUser(row);
}
