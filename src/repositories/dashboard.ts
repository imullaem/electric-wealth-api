import { opt, type Db } from '../db/connection.js';
import type { DashboardResponse } from '../schemas/dashboard.js';
import { totalVisibleBalance } from './accounts.js';

/** Assembles the dashboard from several tables. Returns undefined if the user has no portfolio snapshot. */
export function getDashboard(db: Db, userId: string): DashboardResponse | undefined {
  const snapshot = db
    .prepare('SELECT currency, day_change, day_change_pct, as_of FROM portfolio_snapshots WHERE user_id = ?')
    .get(userId) as { currency: string; day_change: number; day_change_pct: number; as_of: string } | undefined;
  if (!snapshot) return undefined;

  const allocation = db
    .prepare('SELECT asset_class, pct FROM asset_allocations WHERE user_id = ? ORDER BY sort_order')
    .all(userId) as unknown as { asset_class: string; pct: number }[];

  const goals = db
    .prepare('SELECT id, name, progress_pct FROM goals WHERE user_id = ? AND show_on_dashboard = 1 ORDER BY sort_order')
    .all(userId) as unknown as { id: string; name: string; progress_pct: number }[];

  const alerts = db
    .prepare('SELECT id, type, title, deep_link FROM alerts WHERE user_id = ? ORDER BY id')
    .all(userId) as unknown as { id: string; type: DashboardResponse['alerts'][number]['type']; title: string; deep_link: string | null }[];

  const quickLinks = db
    .prepare('SELECT label, deep_link FROM quick_links WHERE user_id = ? ORDER BY sort_order')
    .all(userId) as unknown as { label: string; deep_link: string }[];

  return {
    portfolio: {
      totalValue: totalVisibleBalance(db, userId),
      currency: snapshot.currency,
      dayChange: snapshot.day_change,
      dayChangePct: snapshot.day_change_pct,
      asOf: snapshot.as_of,
    },
    allocation: allocation.map((a) => ({ assetClass: a.asset_class, pct: a.pct })),
    goals: goals.map((g) => ({ id: g.id, name: g.name, progressPct: g.progress_pct })),
    alerts: alerts.map((a) => ({ id: a.id, type: a.type, title: a.title, deepLink: opt(a.deep_link) })),
    quickLinks: quickLinks.map((l) => ({ label: l.label, deepLink: l.deep_link })),
  };
}
