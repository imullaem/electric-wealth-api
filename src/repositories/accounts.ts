import { randomUUID } from 'node:crypto';
import { opt, pageClause, toBool, type Db } from '../db/connection.js';
import type {
  AccountOpenRequest,
  AccountPatchRequest,
  AccountSummary,
  Holding,
  Transaction,
} from '../schemas/accounts.js';

interface AccountRow {
  id: string;
  type: AccountSummary['type'];
  display_name: string;
  nickname: string | null;
  balance: number;
  currency: string;
  hidden: number;
  day_change: number | null;
  day_change_pct: number | null;
  contribution_room: number | null;
  tax_status: string;
  rate_of_return: number | null;
}

const toAccount = (r: AccountRow): AccountSummary => ({
  id: r.id,
  type: r.type,
  displayName: r.display_name,
  nickname: r.nickname,
  balance: r.balance,
  currency: r.currency,
  hidden: toBool(r.hidden),
  dayChange: opt(r.day_change),
  dayChangePct: opt(r.day_change_pct),
  contributionRoom: r.contribution_room,
  taxStatus: r.tax_status,
  rateOfReturn: opt(r.rate_of_return),
});

export function listVisibleAccounts(db: Db, userId: string, page: number, pageSize: number) {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM accounts WHERE user_id = ? AND hidden = 0')
    .get(userId) as { total: number };
  const limit = pageClause(page, pageSize);
  const rows = db
    .prepare(`SELECT * FROM accounts WHERE user_id = ? AND hidden = 0 ORDER BY sort_order ${limit.sql}`)
    .all(userId, ...limit.params) as unknown as AccountRow[];
  return { items: rows.map(toAccount), total };
}

export function findAccount(db: Db, userId: string, accountId: string): AccountSummary | undefined {
  const row = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND id = ?').get(userId, accountId) as
    | AccountRow
    | undefined;
  return row && toAccount(row);
}

/** Sum of visible account balances, used for the dashboard portfolio total. */
export function totalVisibleBalance(db: Db, userId: string): number {
  const { total } = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM accounts WHERE user_id = ? AND hidden = 0')
    .get(userId) as { total: number };
  return total;
}

export function updateAccount(db: Db, userId: string, accountId: string, patch: AccountPatchRequest): void {
  if (patch.nickname !== undefined) {
    db.prepare('UPDATE accounts SET nickname = ? WHERE user_id = ? AND id = ?').run(patch.nickname, userId, accountId);
  }
  if (patch.hidden !== undefined) {
    db.prepare('UPDATE accounts SET hidden = ? WHERE user_id = ? AND id = ?').run(patch.hidden ? 1 : 0, userId, accountId);
  }
}

/** Tax treatment and starting contribution room (cents) for a newly opened account. */
const NEW_ACCOUNT_RULES: Record<AccountOpenRequest['type'], { taxStatus: string; contributionRoom: number | null }> = {
  TFSA: { taxStatus: 'Tax-free', contributionRoom: 700000 }, // 2024 annual limit, $7,000
  FHSA: { taxStatus: 'Tax-free', contributionRoom: 800000 }, // annual limit, $8,000
  RRSP: { taxStatus: 'Tax-deferred', contributionRoom: null }, // depends on income; set later
  NON_REGISTERED: { taxStatus: 'Taxable', contributionRoom: null },
};

/** Opens an empty account at the end of the user's list and returns its id. */
export function openAccount(db: Db, userId: string, input: AccountOpenRequest): string {
  const id = `acct-${randomUUID().slice(0, 8)}`;
  const rules = NEW_ACCOUNT_RULES[input.type];
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM accounts WHERE user_id = ?')
    .get(userId) as { next: number };
  db.prepare(
    `INSERT INTO accounts (user_id, id, type, display_name, nickname, balance, currency, hidden, day_change, day_change_pct,
                           contribution_room, tax_status, rate_of_return, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, 'CAD', 0, 0, 0, ?, ?, 0, ?)`,
  ).run(userId, id, input.type, input.displayName, input.nickname || null, rules.contributionRoom, rules.taxStatus, next);
  // An empty performance record, so the account page shows "no history yet" rather than an error.
  db.prepare(
    `INSERT INTO account_performance (user_id, account_id, time_weighted_return_pct, currency, benchmark_name)
     VALUES (?, ?, 0, 'CAD', 'S&P/TSX Composite')`,
  ).run(userId, id);
  return id;
}

interface HoldingRow {
  symbol: string;
  name: string;
  quantity: number;
  market_value: number;
  currency: string;
  weight_pct: number;
}

export function listHoldings(db: Db, userId: string, accountId: string): Holding[] {
  const rows = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND account_id = ? ORDER BY weight_pct DESC, symbol')
    .all(userId, accountId) as unknown as HoldingRow[];
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    quantity: r.quantity,
    marketValue: r.market_value,
    currency: r.currency,
    weightPct: r.weight_pct,
  }));
}

interface TransactionRow {
  id: string;
  date: string;
  description: string;
  detail: string | null;
  type: Transaction['type'];
  amount: number;
  currency: string;
}

const toTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  date: r.date,
  description: r.description,
  detail: opt(r.detail),
  type: r.type,
  amount: r.amount,
  currency: r.currency,
});

export function listPostedTransactions(
  db: Db,
  userId: string,
  accountId: string,
  opts: { page: number; pageSize: number; type?: Transaction['type'] },
) {
  const where = `user_id = ? AND account_id = ? AND status = 'posted'${opts.type ? ' AND type = ?' : ''}`;
  const params = opts.type ? [userId, accountId, opts.type] : [userId, accountId];
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM transactions WHERE ${where}`).get(...params) as {
    total: number;
  };
  const limit = pageClause(opts.page, opts.pageSize);
  const rows = db
    .prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, id ${limit.sql}`)
    .all(...params, ...limit.params) as unknown as TransactionRow[];
  return { items: rows.map(toTransaction), total };
}

export function listScheduledTransactions(db: Db, userId: string, accountId: string): Transaction[] {
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE user_id = ? AND account_id = ? AND status = 'scheduled' ORDER BY date, id`,
    )
    .all(userId, accountId) as unknown as TransactionRow[];
  return rows.map(toTransaction);
}

export interface PerformanceRecord {
  timeWeightedReturnPct: number;
  currency: string;
  benchmarkName: string;
  series: { t: string; v: number }[];
  benchmarkSeries: { t: string; v: number }[];
}

export function findPerformance(db: Db, userId: string, accountId: string): PerformanceRecord | undefined {
  const perf = db
    .prepare('SELECT * FROM account_performance WHERE user_id = ? AND account_id = ?')
    .get(userId, accountId) as
    | { time_weighted_return_pct: number; currency: string; benchmark_name: string }
    | undefined;
  if (!perf) return undefined;
  const points = db
    .prepare('SELECT series, period, value FROM performance_points WHERE user_id = ? AND account_id = ? ORDER BY period')
    .all(userId, accountId) as unknown as { series: 'account' | 'benchmark'; period: string; value: number }[];
  return {
    timeWeightedReturnPct: perf.time_weighted_return_pct,
    currency: perf.currency,
    benchmarkName: perf.benchmark_name,
    series: points.filter((p) => p.series === 'account').map((p) => ({ t: p.period, v: p.value })),
    benchmarkSeries: points.filter((p) => p.series === 'benchmark').map((p) => ({ t: p.period, v: p.value })),
  };
}
