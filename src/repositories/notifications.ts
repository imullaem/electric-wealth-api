import { toBool, type Db } from '../db/connection.js';
import type { Notification } from '../schemas/notifications.js';

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: Notification['type'];
  created_at: string;
  read: number;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id,
  title: r.title,
  body: r.body,
  type: r.type,
  createdAt: r.created_at,
  read: toBool(r.read),
});

export function listNotifications(db: Db, userId: string): Notification[] {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id')
    .all(userId) as unknown as NotificationRow[];
  return rows.map(toNotification);
}

/** Marks one notification read. Returns false if the user has no notification with that id. */
export function markNotificationRead(db: Db, userId: string, id: string): boolean {
  const result = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?').run(userId, id);
  return Number(result.changes) > 0;
}

/** Marks all of the user's notifications read. Returns how many were unread. */
export function markAllNotificationsRead(db: Db, userId: string): number {
  const result = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
  return Number(result.changes);
}
