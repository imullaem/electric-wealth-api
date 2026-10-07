import { opt, type Db } from '../db/connection.js';
import type { Quote } from '../schemas/market.js';

interface SecurityRow {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  about: string | null;
  held: number;
  watched: number;
}

// held: the user has the symbol in a visible account. watched: it is on their watchlist.
const QUOTE_SELECT = `
  SELECT s.*,
    EXISTS (SELECT 1 FROM holdings h JOIN accounts a ON a.user_id = h.user_id AND a.id = h.account_id
            WHERE h.user_id = ? AND h.symbol = s.symbol AND a.hidden = 0) AS held,
    EXISTS (SELECT 1 FROM watchlist w WHERE w.user_id = ? AND w.symbol = s.symbol) AS watched
  FROM securities s`;

const toQuote = (r: SecurityRow): Quote => ({
  symbol: r.symbol,
  name: r.name,
  exchange: r.exchange,
  price: r.price,
  currency: r.currency,
  change: r.change,
  changePct: r.change_pct,
  held: r.held === 1,
  watched: r.watched === 1,
});

/** Quotes for the given symbols (unknown ones are skipped), or for every security when none are given. */
export function listQuotes(db: Db, userId: string, symbols?: string[]): Quote[] {
  if (symbols?.length) {
    const marks = symbols.map(() => '?').join(', ');
    const rows = db
      .prepare(`${QUOTE_SELECT} WHERE s.symbol IN (${marks}) ORDER BY s.symbol`)
      .all(userId, userId, ...symbols) as unknown as SecurityRow[];
    return rows.map(toQuote);
  }
  const rows = db.prepare(`${QUOTE_SELECT} ORDER BY s.symbol`).all(userId, userId) as unknown as SecurityRow[];
  return rows.map(toQuote);
}

export function findSecurity(db: Db, userId: string, symbol: string) {
  const row = db.prepare(`${QUOTE_SELECT} WHERE s.symbol = ?`).get(userId, userId, symbol) as SecurityRow | undefined;
  return row && { ...toQuote(row), about: opt(row.about) };
}

export function listWatchlist(db: Db, userId: string): Quote[] {
  const rows = db
    .prepare(
      `${QUOTE_SELECT} JOIN watchlist w2 ON w2.symbol = s.symbol AND w2.user_id = ?
       ORDER BY w2.added_at, s.symbol`,
    )
    .all(userId, userId, userId) as unknown as SecurityRow[];
  return rows.map(toQuote);
}

export function addToWatchlist(db: Db, userId: string, symbol: string): void {
  db.prepare(
    `INSERT INTO watchlist (user_id, symbol, added_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT (user_id, symbol) DO NOTHING`,
  ).run(userId, symbol);
}

export function removeFromWatchlist(db: Db, userId: string, symbol: string): void {
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?').run(userId, symbol);
}

export function priceHistory(db: Db, symbol: string, range: string) {
  return db
    .prepare('SELECT t, close AS c FROM price_history WHERE symbol = ? AND range = ? ORDER BY t')
    .all(symbol, range) as unknown as { t: string; c: number }[];
}

export function searchSecurities(db: Db, q?: string) {
  const like = `%${(q ?? '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .prepare(
      `SELECT symbol, name, exchange, currency FROM securities
       WHERE symbol LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
       ORDER BY symbol`,
    )
    .all(like, like) as unknown as { symbol: string; name: string; exchange: string; currency: string }[];
}

export function listNews(db: Db) {
  const rows = db.prepare('SELECT * FROM market_news ORDER BY published_at DESC').all() as unknown as {
    id: string;
    title: string;
    source: string;
    published_at: string;
    tag: string | null;
  }[];
  return rows.map((r) => ({ id: r.id, title: r.title, source: r.source, publishedAt: r.published_at, tag: opt(r.tag) }));
}

/** The most recent week's roundup. */
export function latestRoundup(db: Db) {
  const latest = db.prepare('SELECT MAX(week_of) AS week FROM market_roundup_items').get() as { week: string | null };
  const rows = db
    .prepare('SELECT * FROM market_roundup_items WHERE week_of = ? ORDER BY published_at DESC')
    .all(latest.week) as unknown as { id: string; title: string; summary: string; published_at: string }[];
  return {
    weekOf: latest.week ?? '',
    items: rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary, publishedAt: r.published_at })),
  };
}

export function listBaskets(db: Db) {
  const rows = db.prepare('SELECT * FROM baskets ORDER BY sort_order, id').all() as unknown as {
    id: string;
    name: string;
    description: string;
    return_1y_pct: number;
    holdings_count: number;
    risk: 'Low' | 'Medium' | 'High';
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    return1YPct: r.return_1y_pct,
    holdings: r.holdings_count,
    risk: r.risk,
  }));
}
