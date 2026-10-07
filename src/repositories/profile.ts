import { opt, toBool, type Db } from '../db/connection.js';
import type {
  PreferencesResponse,
  PreferencesUpdate,
  ProfileAddressUpdate,
  ProfileResponse,
} from '../schemas/profile.js';

interface ProfileRow {
  name: string;
  email: string;
  date_of_birth: string;
  phone_masked: string;
  sin_masked: string | null;
  member_since: number;
  address_line1: string;
  address_line2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  trusted_contact_name: string | null;
  trusted_contact_relationship: string | null;
}

export function findProfile(db: Db, userId: string): ProfileResponse | undefined {
  const r = db
    .prepare(
      `SELECT u.name, u.email, u.date_of_birth, p.*
       FROM users u JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId) as ProfileRow | undefined;
  if (!r) return undefined;
  return {
    name: r.name,
    email: r.email,
    phoneMasked: r.phone_masked,
    dateOfBirth: r.date_of_birth,
    sinMasked: opt(r.sin_masked),
    memberSince: r.member_since,
    address: {
      line1: r.address_line1,
      line2: opt(r.address_line2),
      city: r.city,
      province: r.province,
      postalCode: r.postal_code,
      country: r.country,
    },
    trustedContact:
      r.trusted_contact_name && r.trusted_contact_relationship
        ? { name: r.trusted_contact_name, relationship: r.trusted_contact_relationship }
        : undefined,
  };
}

export function updateAddress(db: Db, userId: string, { address }: ProfileAddressUpdate): void {
  db.prepare(
    `UPDATE user_profiles
     SET address_line1 = ?, address_line2 = ?, city = ?, province = ?, postal_code = ?, country = ?
     WHERE user_id = ?`,
  ).run(address.line1, address.line2 || null, address.city, address.province, address.postalCode, address.country, userId);
}

interface PreferencesRow {
  notify_email: number;
  notify_sms: number;
  notify_push: number;
  document_delivery: PreferencesResponse['documentDelivery'];
  language: PreferencesResponse['language'];
  theme: PreferencesResponse['theme'];
  default_meeting_type: PreferencesResponse['defaultMeetingType'];
}

export function findPreferences(db: Db, userId: string): PreferencesResponse | undefined {
  const r = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as PreferencesRow | undefined;
  if (!r) return undefined;
  return {
    notifications: { email: toBool(r.notify_email), sms: toBool(r.notify_sms), push: toBool(r.notify_push) },
    documentDelivery: r.document_delivery,
    language: r.language,
    theme: r.theme,
    defaultMeetingType: r.default_meeting_type,
  };
}

export function updatePreferences(db: Db, userId: string, update: PreferencesUpdate): void {
  const current = findPreferences(db, userId);
  if (!current) return;
  const next = {
    ...current,
    ...update,
    notifications: { ...current.notifications, ...update.notifications },
  };
  db.prepare(
    `UPDATE user_preferences
     SET notify_email = ?, notify_sms = ?, notify_push = ?, document_delivery = ?,
         language = ?, theme = ?, default_meeting_type = ?
     WHERE user_id = ?`,
  ).run(
    next.notifications.email ? 1 : 0,
    next.notifications.sms ? 1 : 0,
    next.notifications.push ? 1 : 0,
    next.documentDelivery,
    next.language,
    next.theme,
    next.defaultMeetingType,
    userId,
  );
}
