import { randomUUID } from 'node:crypto';
import { pageClause, type Db } from '../db/connection.js';
import type { Goal, GoalCreateRequest } from '../schemas/goals.js';

interface GoalRow {
  id: string;
  name: string;
  category: Goal['category'];
  current_amount: number;
  target_amount: number;
  currency: string;
  target_date: string;
  progress_pct: number;
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  category: r.category,
  currentAmount: r.current_amount,
  targetAmount: r.target_amount,
  currency: r.currency,
  targetDate: r.target_date,
  progressPct: r.progress_pct,
});

export function listGoals(db: Db, userId: string, page: number, pageSize: number) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM goals WHERE user_id = ?').get(userId) as {
    total: number;
  };
  const limit = pageClause(page, pageSize);
  const rows = db
    .prepare(`SELECT * FROM goals WHERE user_id = ? ORDER BY sort_order, id ${limit.sql}`)
    .all(userId, ...limit.params) as unknown as GoalRow[];
  return { items: rows.map(toGoal), total };
}

/** Creates a goal at the end of the user's list. New goals are not pinned to the dashboard. */
export function createGoal(db: Db, userId: string, input: GoalCreateRequest): Goal {
  const id = `goal-${randomUUID().slice(0, 8)}`;
  const current = input.currentAmount ?? 0;
  const progressPct = Math.round((current / input.targetAmount) * 100);
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM goals WHERE user_id = ?')
    .get(userId) as { next: number };
  db.prepare(
    `INSERT INTO goals (user_id, id, name, category, current_amount, target_amount, currency, target_date, progress_pct, show_on_dashboard, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(userId, id, input.name, input.category, current, input.targetAmount, input.currency, input.targetDate, progressPct, next);
  return {
    id,
    name: input.name,
    category: input.category,
    currentAmount: current,
    targetAmount: input.targetAmount,
    currency: input.currency,
    targetDate: input.targetDate,
    progressPct,
  };
}
