import { randomUUID } from 'node:crypto';
import { opt, toBool, type Db } from '../db/connection.js';
import type { AdvisorMessage, Appointment, AppointmentCreateRequest, AvailabilityResponse } from '../schemas/advisor.js';

/** Meeting start times offered every business day (Toronto time). */
export const SLOT_TIMES = ['09:00', '10:30', '12:00', '14:30', '16:00'];
const BOOKABLE_DAYS = 5;
const TIME_ZONE = 'America/Toronto';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Today's date in Toronto, as YYYY-MM-DD. */
function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

/** The next n weekdays after `from` (YYYY-MM-DD), as YYYY-MM-DD. */
export function nextBusinessDays(from: string, n: number): string[] {
  const days: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  while (days.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

interface AdvisorRow {
  id: string;
  name: string;
  designation: string | null;
  available: number;
}

export function findUserAdvisor(db: Db, userId: string) {
  const row = db
    .prepare('SELECT a.* FROM advisors a JOIN users u ON u.advisor_id = a.id WHERE u.id = ?')
    .get(userId) as AdvisorRow | undefined;
  return row && { id: row.id, name: row.name, designation: opt(row.designation), available: toBool(row.available) };
}

/** Open slots for the advisor over the booking window. A slot is open if no scheduled meeting holds it. */
export function getAvailability(db: Db, advisor: AvailabilityResponse['advisor']): AvailabilityResponse {
  const dates = nextBusinessDays(torontoToday(), BOOKABLE_DAYS);
  const taken = db
    .prepare(
      `SELECT date, time FROM appointments
       WHERE advisor_id = ? AND status = 'scheduled' AND date BETWEEN ? AND ?`,
    )
    .all(advisor.id, dates[0], dates.at(-1)!) as unknown as { date: string; time: string }[];
  const takenSet = new Set(taken.map((t) => `${t.date} ${t.time}`));
  return {
    advisor,
    meetingTypes: ['video', 'phone', 'in_person'],
    days: dates.map((date) => ({
      date,
      slots: advisor.available ? SLOT_TIMES.filter((time) => !takenSet.has(`${date} ${time}`)) : [],
    })),
  };
}

export function isSlotOpen(db: Db, advisor: AvailabilityResponse['advisor'], date: string, time: string): boolean {
  return getAvailability(db, advisor).days.some((d) => d.date === date && d.slots.includes(time));
}

interface AppointmentRow {
  id: string;
  advisor_id: string;
  meeting_type: Appointment['meetingType'];
  date: string;
  time: string;
  status: Appointment['status'];
  notes: string | null;
}

const toAppointment = (r: AppointmentRow): Appointment => ({
  id: r.id,
  advisorId: r.advisor_id,
  meetingType: r.meeting_type,
  date: r.date,
  time: r.time,
  status: r.status,
  notes: opt(r.notes),
});

export function listAppointments(db: Db, userId: string): Appointment[] {
  const rows = db
    .prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY date, time')
    .all(userId) as unknown as AppointmentRow[];
  return rows.map(toAppointment);
}

export function findAppointment(db: Db, userId: string, id: string): Appointment | undefined {
  const row = db.prepare('SELECT * FROM appointments WHERE user_id = ? AND id = ?').get(userId, id) as
    | AppointmentRow
    | undefined;
  return row && toAppointment(row);
}

export function createAppointment(db: Db, userId: string, advisorId: string, input: AppointmentCreateRequest): string {
  const id = `appt-${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO appointments (id, user_id, advisor_id, meeting_type, date, time, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
  ).run(id, userId, advisorId, input.meetingType, input.date, input.time, input.notes || null, nowIso());
  return id;
}

export function rescheduleAppointment(db: Db, userId: string, id: string, date: string, time: string): void {
  db.prepare('UPDATE appointments SET date = ?, time = ? WHERE user_id = ? AND id = ?').run(date, time, userId, id);
}

export function cancelAppointment(db: Db, userId: string, id: string): void {
  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE user_id = ? AND id = ?").run(userId, id);
}

interface MessageRow {
  id: string;
  sender: AdvisorMessage['from'];
  text: string;
  sent_at: string;
}

const toMessage = (r: MessageRow): AdvisorMessage => ({ id: r.id, from: r.sender, text: r.text, at: r.sent_at });

export function listMessages(db: Db, userId: string): AdvisorMessage[] {
  const rows = db
    .prepare('SELECT * FROM advisor_messages WHERE user_id = ? ORDER BY sent_at, id')
    .all(userId) as unknown as MessageRow[];
  return rows.map(toMessage);
}

export function addClientMessage(db: Db, userId: string, advisorId: string, text: string): AdvisorMessage {
  const row: MessageRow = { id: `msg-${randomUUID().slice(0, 8)}`, sender: 'client', text, sent_at: nowIso() };
  db.prepare(
    `INSERT INTO advisor_messages (id, user_id, advisor_id, sender, text, sent_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, userId, advisorId, row.sender, row.text, row.sent_at);
  return toMessage(row);
}
