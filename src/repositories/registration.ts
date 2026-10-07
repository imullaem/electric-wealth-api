import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.js';
import type { RegistrationCompleteRequest } from '../schemas/registration.js';

const REGISTRATION_TTL_MS = 30 * 60 * 1000;
const DEMO_MFA_CODE = '123456';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const normalisePostalCode = (v: string) => v.replace(/\s/g, '').toUpperCase();
const normaliseAnswer = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

export interface RegistrationRow {
  id: string;
  email: string;
  password: string;
  account_number: string | null;
  trusted_contact_name: string | null;
  trusted_contact_relationship: string | null;
  security_answers_saved: number;
  user_id: string | null;
  expires_at: string;
}

export function emailInUse(db: Db, email: string): boolean {
  return db.prepare('SELECT 1 FROM users WHERE email = ?').get(email) !== undefined;
}

export function startRegistration(db: Db, email: string, password: string) {
  const id = `reg-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + REGISTRATION_TTL_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare(
    'INSERT INTO registrations (id, email, password, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, email, password, nowIso(), expiresAt);
  return { registrationId: id, expiresAt };
}

/** An open registration: exists, not expired and not yet completed. */
export function findOpenRegistration(db: Db, id: string): RegistrationRow | undefined {
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) as RegistrationRow | undefined;
  if (!row || row.user_id || row.expires_at <= nowIso()) return undefined;
  return row;
}

interface OfflineClientRow {
  account_number: string;
  name: string;
  date_of_birth: string;
  phone_masked: string;
  sin_masked: string | null;
  client_since: number;
  address_line1: string;
  address_line2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  language: 'en-CA' | 'fr-CA';
  advisor_id: string | null;
  enrolled_user_id: string | null;
}

/** Finds the branch record matching all three identity details. */
export function matchOfflineClient(db: Db, accountNumber: string, postalCode: string, dateOfBirth: string) {
  const row = db.prepare('SELECT * FROM offline_clients WHERE account_number = ?').get(accountNumber) as
    | OfflineClientRow
    | undefined;
  if (!row) return undefined;
  if (normalisePostalCode(row.postal_code) !== normalisePostalCode(postalCode) || row.date_of_birth !== dateOfBirth) {
    return undefined;
  }
  return row;
}

export function attachOfflineClient(db: Db, registrationId: string, accountNumber: string): void {
  db.prepare('UPDATE registrations SET account_number = ? WHERE id = ?').run(accountNumber, registrationId);
}

export function listSecurityQuestions(db: Db, language: 'en-CA' | 'fr-CA') {
  const column = language === 'fr-CA' ? 'text_fr' : 'text_en';
  return db.prepare(`SELECT id, ${column} AS text FROM security_questions ORDER BY sort_order`).all() as unknown as {
    id: string;
    text: string;
  }[];
}

export function unknownQuestionIds(db: Db, ids: string[]): string[] {
  const known = new Set(
    (db.prepare('SELECT id FROM security_questions').all() as unknown as { id: string }[]).map((r) => r.id),
  );
  return ids.filter((id) => !known.has(id));
}

export function saveSecurityAnswers(db: Db, registrationId: string, answers: { questionId: string; answer: string }[]): void {
  db.prepare('DELETE FROM registration_security_answers WHERE registration_id = ?').run(registrationId);
  const insert = db.prepare('INSERT INTO registration_security_answers (registration_id, question_id, answer) VALUES (?, ?, ?)');
  for (const a of answers) insert.run(registrationId, a.questionId, normaliseAnswer(a.answer));
  db.prepare('UPDATE registrations SET security_answers_saved = 1 WHERE id = ?').run(registrationId);
}

export function saveTrustedContact(
  db: Db,
  registrationId: string,
  c: { name: string; relationship: string; phone?: string; email?: string },
): void {
  db.prepare(
    `UPDATE registrations SET trusted_contact_name = ?, trusted_contact_relationship = ?, trusted_contact_phone = ?, trusted_contact_email = ?
     WHERE id = ?`,
  ).run(c.name, c.relationship, c.phone || null, c.email || null, registrationId);
}

/**
 * Turns a finished registration into a user: login, profile (from the branch record), preferences,
 * advisor, security answers, an empty portfolio, starter quick links and a welcome notification.
 * Returns the new user id.
 */
export function completeRegistration(db: Db, reg: RegistrationRow, input: RegistrationCompleteRequest): string {
  const client = db.prepare('SELECT * FROM offline_clients WHERE account_number = ?').get(reg.account_number) as unknown as OfflineClientRow;
  const userId = `u-${randomUUID().slice(0, 8)}`;
  const now = nowIso();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO users (id, email, password, mfa_code, name, account_number, date_of_birth, advisor_id, mfa_method, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, reg.email, reg.password, DEMO_MFA_CODE, client.name, client.account_number, client.date_of_birth, client.advisor_id, input.mfaMethod, now);
    db.prepare(
      `INSERT INTO user_profiles (user_id, phone_masked, sin_masked, member_since, address_line1, address_line2, city, province, postal_code, country,
                                  trusted_contact_name, trusted_contact_relationship)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      client.phone_masked,
      client.sin_masked,
      client.client_since,
      client.address_line1,
      client.address_line2,
      client.city,
      client.province,
      client.postal_code,
      client.country,
      reg.trusted_contact_name,
      reg.trusted_contact_relationship,
    );
    // Electronic delivery was consented to; SMS alerts follow the chosen code method.
    db.prepare(
      `INSERT INTO user_preferences (user_id, notify_email, notify_sms, notify_push, document_delivery, language, theme, default_meeting_type)
       VALUES (?, 1, ?, 0, 'digital', ?, 'system', 'video')`,
    ).run(userId, input.mfaMethod === 'sms' ? 1 : 0, client.language);
    db.prepare(
      `INSERT INTO user_security_answers (user_id, question_id, answer)
       SELECT ?, question_id, answer FROM registration_security_answers WHERE registration_id = ?`,
    ).run(userId, reg.id);
    db.prepare(
      `INSERT INTO portfolio_snapshots (user_id, currency, day_change, day_change_pct, as_of) VALUES (?, 'CAD', 0, 0, ?)`,
    ).run(userId, now);
    db.prepare(
      `INSERT INTO notifications (user_id, id, title, body, type, created_at, read) VALUES (?, 'welcome', ?, ?, 'SUCCESS', ?, 0)`,
    ).run(
      userId,
      client.language === 'fr-CA' ? 'Bienvenue chez Electric Wealth' : 'Welcome to Electric Wealth',
      client.language === 'fr-CA'
        ? 'Votre accès en ligne est prêt. Ouvrez un compte ou écrivez à votre conseiller pour commencer.'
        : 'Your online access is ready. Open an account or message your advisor to get started.',
      now,
    );
    // Starter quick links for someone with no online history yet (labels are localised by the API).
    const quickLink = db.prepare('INSERT INTO quick_links (user_id, sort_order, label, deep_link) VALUES (?, ?, ?, ?)');
    quickLink.run(userId, 1, 'Open account', 'electricwealth://accounts/new');
    quickLink.run(userId, 2, 'Book advisor', 'electricwealth://advisor');
    quickLink.run(userId, 3, 'Learn basics', 'electricwealth://learn');
    db.prepare('UPDATE offline_clients SET enrolled_user_id = ? WHERE account_number = ?').run(userId, client.account_number);
    db.prepare('UPDATE registrations SET mfa_method = ?, consented_at = ?, user_id = ? WHERE id = ?').run(input.mfaMethod, now, userId, reg.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return userId;
}
