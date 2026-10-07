import type { Db } from '../db/connection.js';
import type { EducationContent } from '../schemas/education.js';

type Language = 'en-CA' | 'fr-CA';
const suffix = (language: Language) => (language === 'fr-CA' ? 'fr' : 'en');

export function listEducationContent(
  db: Db,
  userId: string,
  language: Language,
  filters: { level?: string; type?: string },
): EducationContent[] {
  const clauses = ['1 = 1'];
  const params: string[] = [userId];
  if (filters.level) {
    clauses.push('c.level = ?');
    params.push(filters.level);
  }
  if (filters.type) {
    clauses.push('c.type = ?');
    params.push(filters.type);
  }
  const rows = db
    .prepare(
      `SELECT c.id, c.title_${suffix(language)} AS title, c.level, c.type, c.duration_min, COALESCE(p.progress_pct, 0) AS progress_pct
       FROM education_content c
       LEFT JOIN education_progress p ON p.content_id = c.id AND p.user_id = ?
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.sort_order, c.id`,
    )
    .all(...params) as unknown as {
    id: string;
    title: string;
    level: EducationContent['level'];
    type: EducationContent['type'];
    duration_min: number;
    progress_pct: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    level: r.level,
    type: r.type,
    durationMin: r.duration_min,
    progressPct: r.progress_pct,
  }));
}

export function educationContentExists(db: Db, contentId: string): boolean {
  return db.prepare('SELECT 1 FROM education_content WHERE id = ?').get(contentId) !== undefined;
}

export function saveEducationProgress(db: Db, userId: string, contentId: string, progressPct: number): void {
  db.prepare(
    `INSERT INTO education_progress (user_id, content_id, progress_pct, updated_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT (user_id, content_id) DO UPDATE SET progress_pct = excluded.progress_pct, updated_at = excluded.updated_at`,
  ).run(userId, contentId, progressPct);
}

export function searchGlossary(db: Db, language: Language, q?: string) {
  const s = suffix(language);
  const like = `%${(q ?? '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare(
      `SELECT term_${s} AS term, definition_${s} AS definition
       FROM glossary_terms
       WHERE term_${s} LIKE ? ESCAPE '\\' OR definition_${s} LIKE ? ESCAPE '\\'`,
    )
    .all(like, like) as unknown as { term: string; definition: string }[];
  // Sorted in code: SQLite's NOCASE ordering puts accented letters (é) after z.
  const collator = new Intl.Collator(language, { sensitivity: 'base' });
  return rows.sort((a, b) => collator.compare(a.term, b.term));
}
