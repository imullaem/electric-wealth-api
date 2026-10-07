import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db/connection.js';
import {
  AccountDetailSchema,
  AccountsListResponseSchema,
  TransactionsResponseSchema,
} from '../src/schemas/accounts.js';
import { TokenResponseSchema } from '../src/schemas/auth.js';
import { DashboardResponseSchema } from '../src/schemas/dashboard.js';
import { DocumentsListResponseSchema } from '../src/schemas/documents.js';
import {
  AdvisorMessagesResponseSchema,
  AppointmentSchema,
  AppointmentsResponseSchema,
  AvailabilityResponseSchema,
} from '../src/schemas/advisor.js';
import { nextBusinessDays } from '../src/repositories/advisor.js';
import { EducationContentResponseSchema, GlossaryResponseSchema } from '../src/schemas/education.js';
import { GoalSchema, GoalsListResponseSchema } from '../src/schemas/goals.js';
import { HistoryResponseSchema, QuotesResponseSchema, SecurityDetailSchema } from '../src/schemas/market.js';
import { NotificationsResponseSchema } from '../src/schemas/notifications.js';
import { PreferencesResponseSchema, ProfileResponseSchema } from '../src/schemas/profile.js';

// Tests run against a fresh copy of the database, built by the sibling electric-wealth-db repo.
const dbRepoReset = resolve(import.meta.dirname, '../../electric-wealth-db/scripts/reset.js');
let tmpDir: string;
let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  if (!existsSync(dbRepoReset)) {
    throw new Error(`Cannot find ${dbRepoReset}. Clone electric-wealth-db next to this repo.`);
  }
  tmpDir = mkdtempSync(join(tmpdir(), 'ew-api-test-'));
  const dbPath = join(tmpDir, 'test.db');
  execFileSync(process.execPath, [dbRepoReset, '--db', dbPath], {
    stdio: 'ignore',
  });
  db = openDatabase(dbPath);
  app = createApp({ db, logRequests: false });
});

afterAll(() => {
  db?.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

const PERSONAS = [
  'sarah.chen@example.com',
  'michael.thompson@example.com',
  'linda.rodriguez@example.com',
  'david.kim@example.com',
  'emma.wilson@example.com',
  'robert.foster@example.com',
];

async function login(email = 'sarah.chen@example.com') {
  const tokenRes = await request(app)
    .post('/api/auth/token')
    .send({ grantType: 'password', username: email, password: 'Demo123!' });
  expect(tokenRes.status).toBe(200);
  const tokens = TokenResponseSchema.parse(tokenRes.body);
  expect(tokens.mfaRequired).toBe(true);

  const mfaRes = await request(app)
    .post('/api/auth/mfa/verify')
    .set('Authorization', `Bearer ${tokens.accessToken}`)
    .send({ challengeId: 'mfa-1', code: '123456', method: 'sms' });
  expect(mfaRes.status).toBe(200);
  return { accessToken: mfaRes.body.accessToken as string, refreshToken: tokens.refreshToken };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('health', () => {
  it('GET /health returns ok without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('auth', () => {
  it('password login + MFA issues an access token', async () => {
    const { accessToken } = await login();
    expect(accessToken).toMatch(/^mock-at-/);
  });

  it('rejects invalid credentials with the error envelope', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ grantType: 'password', username: 'sarah.chen@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.traceId).toMatch(/^trace-/);
  });

  it('rejects a wrong MFA code', async () => {
    const tokenRes = await request(app)
      .post('/api/auth/token')
      .send({ grantType: 'password', username: 'sarah.chen@example.com', password: 'Demo123!' });
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .set(auth(tokenRes.body.accessToken))
      .send({ challengeId: 'mfa-1', code: '000000', method: 'sms' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_MFA');
  });

  it('does not accept a token that has not completed MFA', async () => {
    const tokenRes = await request(app)
      .post('/api/auth/token')
      .send({ grantType: 'password', username: 'sarah.chen@example.com', password: 'Demo123!' });
    const res = await request(app).get('/api/wealth/dashboard').set(auth(tokenRes.body.accessToken));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a protected route without a bearer token', async () => {
    const res = await request(app).get('/api/wealth/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rotates tokens on refresh and revokes the old refresh token', async () => {
    const { refreshToken } = await login('emma.wilson@example.com');
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toMatch(/^mock-at-/);
    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reused.status).toBe(401);
  });

  it('logout revokes the access token', async () => {
    const { accessToken } = await login();
    expect((await request(app).post('/api/auth/logout').set(auth(accessToken)).send({})).status).toBe(204);
    expect((await request(app).get('/api/wealth/dashboard').set(auth(accessToken))).status).toBe(401);
  });
});

describe('dashboard', () => {
  it('returns the persona-aligned dashboard for Sarah Chen', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/dashboard').set(auth(accessToken));
    expect(res.status).toBe(200);
    const dashboard = DashboardResponseSchema.parse(res.body);
    expect(dashboard.portfolio.currency).toBe('CAD');
    expect(dashboard.portfolio.totalValue).toBe(6025000);
    expect(dashboard.goals).toEqual([{ id: 'goal-1', name: 'Home Down Payment', progressPct: 48 }]);
  });

  it('returns a valid dashboard for all six demo personas', async () => {
    for (const email of PERSONAS) {
      const { accessToken } = await login(email);
      const res = await request(app).get('/api/wealth/dashboard').set(auth(accessToken));
      expect(res.status, email).toBe(200);
      DashboardResponseSchema.parse(res.body);
    }
  });

  it('localizes quick-link labels for fr-CA', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/dashboard').set(auth(accessToken)).set('Accept-Language', 'fr-CA');
    expect(res.body.quickLinks[0].label).toBe('Ouvrir un compte');
  });
});

describe('accounts', () => {
  it('lists visible accounts only (Linda has a hidden RRIF)', async () => {
    const { accessToken } = await login('linda.rodriguez@example.com');
    const res = await request(app).get('/api/wealth/accounts').set(auth(accessToken));
    const list = AccountsListResponseSchema.parse(res.body);
    expect(list.total).toBe(4);
    expect(list.items.map((a) => a.id)).not.toContain('rrif');
  });

  it('returns account detail with holdings', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/accounts/tfsa').set(auth(accessToken));
    const detail = AccountDetailSchema.parse(res.body);
    expect(detail.displayName).toBe('Growth TFSA');
    expect(detail.holdings.length).toBe(3);
  });

  it('returns 404 for an account belonging to nobody', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/accounts/nope').set(auth(accessToken));
    expect(res.status).toBe(404);
  });

  it('pages transactions and includes scheduled ones', async () => {
    const { accessToken } = await login();
    const res = await request(app)
      .get('/api/wealth/accounts/tfsa/transactions?page=1&pageSize=5')
      .set(auth(accessToken));
    const txs = TransactionsResponseSchema.parse(res.body);
    expect(txs.total).toBe(7);
    expect(txs.items).toHaveLength(5);
    expect(txs.items[0].id).toBe('t1');
    expect(txs.scheduled).toHaveLength(1);
  });

  it('filters transactions by type', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/accounts/tfsa/transactions?type=dividend').set(auth(accessToken));
    expect(res.body.items.every((t: { type: string }) => t.type === 'dividend')).toBe(true);
  });

  it('rejects an invalid query parameter', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/wealth/accounts/tfsa/transactions?type=bogus').set(auth(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('opens a new empty account with type-specific rules', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app)
      .post('/api/wealth/accounts')
      .set(auth(accessToken))
      .send({ type: 'RRSP', displayName: ' Spousal RRSP ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'RRSP', displayName: 'Spousal RRSP', balance: 0, taxStatus: 'Tax-deferred', contributionRoom: null });
    const id = res.body.id as string;
    const list = AccountsListResponseSchema.parse((await request(app).get('/api/wealth/accounts').set(auth(accessToken))).body);
    expect(list.items.at(-1)?.id).toBe(id);
    const detail = AccountDetailSchema.parse((await request(app).get(`/api/wealth/accounts/${id}`).set(auth(accessToken))).body);
    expect(detail.holdings).toEqual([]);
    const perf = await request(app).get(`/api/wealth/accounts/${id}/performance`).set(auth(accessToken));
    expect(perf.status).toBe(200);
    expect(perf.body.series).toEqual([]);
    const txs = TransactionsResponseSchema.parse(
      (await request(app).get(`/api/wealth/accounts/${id}/transactions`).set(auth(accessToken))).body,
    );
    expect(txs.total).toBe(0);
  });

  it('gives a new TFSA the annual contribution room', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app).post('/api/wealth/accounts').set(auth(accessToken)).send({ type: 'TFSA', displayName: 'Second TFSA' });
    expect(res.body).toMatchObject({ taxStatus: 'Tax-free', contributionRoom: 700000 });
  });

  it('rejects account types that need an advisor', async () => {
    const { accessToken } = await login();
    for (const body of [{ type: 'RESP', displayName: 'Kids' }, { type: 'TFSA', displayName: '' }]) {
      const res = await request(app).post('/api/wealth/accounts').set(auth(accessToken)).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('persists a nickname change to the database', async () => {
    const { accessToken } = await login('michael.thompson@example.com');
    const patch = await request(app)
      .patch('/api/wealth/accounts/tfsa')
      .set(auth(accessToken))
      .send({ nickname: 'Rainy day' });
    expect(patch.status).toBe(200);
    const row = db.prepare("SELECT nickname FROM accounts WHERE user_id = 'michael' AND id = 'tfsa'").get() as {
      nickname: string;
    };
    expect(row.nickname).toBe('Rainy day');
  });
});

describe('documents', () => {
  it('lists and filters documents', async () => {
    const { accessToken } = await login();
    const all = DocumentsListResponseSchema.parse(
      (await request(app).get('/api/wealth/documents').set(auth(accessToken))).body,
    );
    expect(all.total).toBe(7);
    const tax2024 = DocumentsListResponseSchema.parse(
      (await request(app).get('/api/wealth/documents?year=2024&category=Tax').set(auth(accessToken))).body,
    );
    expect(tax2024.items.map((d) => d.id)).toEqual(['d1']);
  });
});

describe('profile', () => {
  it('returns the profile with trusted contact', async () => {
    const { accessToken } = await login();
    const profile = ProfileResponseSchema.parse((await request(app).get('/api/profile').set(auth(accessToken))).body);
    expect(profile.name).toBe('Sarah Chen');
    expect(profile.trustedContact).toEqual({ name: 'David Chen', relationship: 'Sibling' });
  });

  it('updates the address and normalizes the postal code', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app)
      .put('/api/profile/address')
      .set(auth(accessToken))
      .send({
        address: { line1: ' 1 Harbour Lane ', line2: 'Unit 4', city: 'Dartmouth', province: 'NS', postalCode: 'b2y4a1', country: 'Canada' },
      });
    expect(res.status).toBe(200);
    const profile = ProfileResponseSchema.parse(res.body);
    expect(profile.address).toEqual({
      line1: '1 Harbour Lane',
      line2: 'Unit 4',
      city: 'Dartmouth',
      province: 'NS',
      postalCode: 'B2Y 4A1',
      country: 'Canada',
    });
    const again = ProfileResponseSchema.parse((await request(app).get('/api/profile').set(auth(accessToken))).body);
    expect(again.address.city).toBe('Dartmouth');
  });

  it('clears address line 2 when it is blank', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app)
      .put('/api/profile/address')
      .set(auth(accessToken))
      .send({ address: { line1: '1 Harbour Lane', line2: '  ', city: 'Dartmouth', province: 'NS', postalCode: 'B2Y 4A1', country: 'Canada' } });
    expect(res.body.address.line2).toBeUndefined();
  });

  it('rejects an invalid postal code or province', async () => {
    const { accessToken } = await login();
    const base = { line1: '1 Main St', city: 'Toronto', country: 'Canada' };
    for (const address of [
      { ...base, province: 'ON', postalCode: '90210' },
      { ...base, province: 'XX', postalCode: 'M5V 2A1' },
      { ...base, line1: '', province: 'ON', postalCode: 'M5V 2A1' },
    ]) {
      const res = await request(app).put('/api/profile/address').set(auth(accessToken)).send({ address });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('document sharing', () => {
  it('records a 7-day share', async () => {
    const { accessToken } = await login();
    const before = Date.now();
    const res = await request(app)
      .post('/api/wealth/documents/d1/share')
      .set(auth(accessToken))
      .send({ recipient: 'accountant@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.recipient).toBe('accountant@example.com');
    const days = (Date.parse(res.body.expiresAt) - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    const row = db.prepare("SELECT recipient FROM document_shares WHERE user_id = 'sarah' AND document_id = 'd1'").get() as {
      recipient: string;
    };
    expect(row.recipient).toBe('accountant@example.com');
  });

  it('validates the recipient and the document', async () => {
    const { accessToken } = await login();
    expect((await request(app).post('/api/wealth/documents/d1/share').set(auth(accessToken)).send({ recipient: 'nope' })).status).toBe(400);
    expect(
      (await request(app).post('/api/wealth/documents/zzz/share').set(auth(accessToken)).send({ recipient: 'a@example.com' })).status,
    ).toBe(404);
  });
});

describe('preferences', () => {
  it('updates language and keeps other preferences', async () => {
    const { accessToken } = await login('david.kim@example.com');
    const res = await request(app).put('/api/preferences').set(auth(accessToken)).send({ language: 'fr-CA' });
    const prefs = PreferencesResponseSchema.parse(res.body);
    expect(prefs.language).toBe('fr-CA');
    expect(prefs.theme).toBe('dark');
  });

  it('merges a partial notification update', async () => {
    const { accessToken } = await login('robert.foster@example.com');
    const before = PreferencesResponseSchema.parse((await request(app).get('/api/preferences').set(auth(accessToken))).body);
    const res = await request(app)
      .put('/api/preferences')
      .set(auth(accessToken))
      .send({ notifications: { sms: !before.notifications.sms }, documentDelivery: 'paper_and_digital' });
    const prefs = PreferencesResponseSchema.parse(res.body);
    expect(prefs.notifications).toEqual({ ...before.notifications, sms: !before.notifications.sms });
    expect(prefs.documentDelivery).toBe('paper_and_digital');
  });
});

describe('goals', () => {
  const nextYear = `${new Date().getUTCFullYear() + 1}-06-30`;

  it('lists goals in order', async () => {
    const { accessToken } = await login();
    const list = GoalsListResponseSchema.parse((await request(app).get('/api/wealth/goals').set(auth(accessToken))).body);
    expect(list.items.map((g) => g.id)).toEqual(['goal-1', 'goal-2', 'goal-3']);
    expect(list.total).toBe(3);
  });

  it('creates a goal, computes progress and appends it to the list', async () => {
    const { accessToken } = await login('linda.rodriguez@example.com');
    const res = await request(app)
      .post('/api/wealth/goals')
      .set(auth(accessToken))
      .send({ name: ' New roof ', category: 'Home', targetAmount: 2000000, currentAmount: 500000, currency: 'CAD', targetDate: nextYear });
    expect(res.status).toBe(201);
    const goal = GoalSchema.parse(res.body);
    expect(goal).toMatchObject({ name: 'New roof', progressPct: 25, currentAmount: 500000 });
    const list = GoalsListResponseSchema.parse((await request(app).get('/api/wealth/goals').set(auth(accessToken))).body);
    expect(list.items.at(-1)?.id).toBe(goal.id);
    // New goals are not added to the dashboard summary.
    const dash = await request(app).get('/api/wealth/dashboard').set(auth(accessToken));
    expect(dash.body.goals.map((g: { id: string }) => g.id)).not.toContain(goal.id);
  });

  it('defaults currentAmount to 0', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app)
      .post('/api/wealth/goals')
      .set(auth(accessToken))
      .send({ name: 'Trip', category: 'Vacation', targetAmount: 300000, currency: 'CAD', targetDate: nextYear });
    expect(res.body).toMatchObject({ currentAmount: 0, progressPct: 0 });
  });

  it('rejects invalid goals', async () => {
    const { accessToken } = await login();
    const base = { name: 'X', category: 'Home', targetAmount: 100000, currency: 'CAD', targetDate: nextYear };
    for (const body of [
      { ...base, name: '' },
      { ...base, targetAmount: 0 },
      { ...base, currentAmount: 200000 },
      { ...base, targetDate: '2020-01-01' },
      { ...base, targetDate: 'soon' },
      { ...base, category: 'Car' },
    ]) {
      const res = await request(app).post('/api/wealth/goals').set(auth(accessToken)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('education', () => {
  it("lists the catalogue with the user's progress", async () => {
    const { accessToken } = await login();
    const items = EducationContentResponseSchema.parse(
      (await request(app).get('/api/education/content').set(auth(accessToken))).body,
    );
    expect(items.map((i) => [i.id, i.progressPct])).toEqual([
      ['e1', 100],
      ['e2', 60],
      ['e3', 0],
      ['e4', 0],
      ['e5', 0],
      ['e6', 0],
    ]);
  });

  it('filters by level and type and localizes titles', async () => {
    const { accessToken } = await login();
    const res = await request(app)
      .get('/api/education/content?level=beginner&type=challenge')
      .set(auth(accessToken))
      .set('Accept-Language', 'fr-CA');
    expect(res.body).toEqual([expect.objectContaining({ id: 'e3', title: 'CELI ou REER : lequel en premier?' })]);
  });

  it('saves progress and creates a row the first time', async () => {
    const { accessToken } = await login('robert.foster@example.com');
    const res = await request(app).post('/api/education/progress').set(auth(accessToken)).send({ contentId: 'e4', progressPct: 100 });
    expect(res.body).toEqual({ contentId: 'e4', progressPct: 100 });
    const items = EducationContentResponseSchema.parse(
      (await request(app).get('/api/education/content').set(auth(accessToken))).body,
    );
    expect(items.find((i) => i.id === 'e4')?.progressPct).toBe(100);
  });

  it('rejects unknown content and out-of-range progress', async () => {
    const { accessToken } = await login();
    expect((await request(app).post('/api/education/progress').set(auth(accessToken)).send({ contentId: 'zz', progressPct: 10 })).status).toBe(404);
    expect((await request(app).post('/api/education/progress').set(auth(accessToken)).send({ contentId: 'e1', progressPct: 101 })).status).toBe(400);
  });

  it('searches the glossary in the requested language', async () => {
    const { accessToken } = await login();
    const all = GlossaryResponseSchema.parse((await request(app).get('/api/education/glossary').set(auth(accessToken))).body);
    expect(all).toHaveLength(7);
    expect(all[0].term).toBe('Asset allocation');
    const en = GlossaryResponseSchema.parse((await request(app).get('/api/education/glossary?q=tax').set(auth(accessToken))).body);
    expect(en.map((e) => e.term)).toEqual(['RRSP', 'TFSA']);
    const fr = GlossaryResponseSchema.parse(
      (await request(app).get('/api/education/glossary?q=celi').set(auth(accessToken)).set('Accept-Language', 'fr-CA')).body,
    );
    expect(fr.map((e) => e.term)).toEqual(['CELI']);
    const frAll = GlossaryResponseSchema.parse(
      (await request(app).get('/api/education/glossary').set(auth(accessToken)).set('Accept-Language', 'fr-CA')).body,
    );
    expect(frAll.map((e) => e.term).slice(-4)).toEqual(['Rééquilibrage', 'REER', 'Répartition de l’actif', 'Taux de rendement']);
  });
});

describe('advisor', () => {
  it('computes the next five business days', () => {
    // 2026-10-09 is a Friday.
    expect(nextBusinessDays('2026-10-09', 5)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });

  it('offers five days of slots with the assigned advisor', async () => {
    const { accessToken } = await login();
    const a = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(accessToken))).body);
    expect(a.advisor).toMatchObject({ name: 'Jordan Avery', designation: 'CFP' });
    expect(a.days).toHaveLength(5);
    expect(a.days[0].slots).toEqual(['09:00', '10:30', '12:00', '14:30', '16:00']);
  });

  it('books a slot, hides it from everyone, and refuses a double booking', async () => {
    const sarah = await login();
    const linda = await login('linda.rodriguez@example.com');
    const { days } = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(sarah.accessToken))).body);
    const date = days[1].date;
    const res = await request(app)
      .post('/api/advisor/appointments')
      .set(auth(sarah.accessToken))
      .send({ meetingType: 'phone', date, time: '10:30', notes: 'Year-end review' });
    expect(res.status).toBe(201);
    expect(AppointmentSchema.parse(res.body)).toMatchObject({ status: 'scheduled', meetingType: 'phone', advisorId: 'adv-1' });

    const forLinda = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(linda.accessToken))).body);
    expect(forLinda.days[1].slots).not.toContain('10:30');
    const clash = await request(app)
      .post('/api/advisor/appointments')
      .set(auth(linda.accessToken))
      .send({ meetingType: 'video', date, time: '10:30' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('rejects slots outside the booking window or schedule', async () => {
    const { accessToken } = await login('david.kim@example.com');
    const { days } = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(accessToken))).body);
    for (const body of [
      { meetingType: 'video', date: '2024-12-09', time: '09:00' },
      { meetingType: 'video', date: days[0].date, time: '08:00' },
    ]) {
      expect((await request(app).post('/api/advisor/appointments').set(auth(accessToken)).send(body)).status).toBe(409);
    }
    expect((await request(app).post('/api/advisor/appointments').set(auth(accessToken)).send({ meetingType: 'video', date: days[0].date, time: '9am' })).status).toBe(400);
  });

  it('reschedules, frees the old slot and cancels', async () => {
    const { accessToken } = await login('michael.thompson@example.com');
    const { days } = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(accessToken))).body);
    const booked = await request(app)
      .post('/api/advisor/appointments')
      .set(auth(accessToken))
      .send({ meetingType: 'video', date: days[2].date, time: '09:00' });
    const id = booked.body.id as string;
    const moved = await request(app).patch(`/api/advisor/appointments/${id}`).set(auth(accessToken)).send({ date: days[3].date, time: '16:00' });
    expect(moved.body).toMatchObject({ date: days[3].date, time: '16:00', status: 'scheduled' });
    const after = AvailabilityResponseSchema.parse((await request(app).get('/api/advisor/availability').set(auth(accessToken))).body);
    expect(after.days[2].slots).toContain('09:00');
    expect(after.days[3].slots).not.toContain('16:00');

    const cancelled = await request(app).patch(`/api/advisor/appointments/${id}`).set(auth(accessToken)).send({ status: 'cancelled' });
    expect(cancelled.body.status).toBe('cancelled');
    const again = await request(app).patch(`/api/advisor/appointments/${id}`).set(auth(accessToken)).send({ status: 'cancelled' });
    expect(again.status).toBe(409);
    expect((await request(app).patch(`/api/advisor/appointments/${id}`).set(auth(accessToken)).send({ date: days[3].date })).status).toBe(400);
  });

  it("lists the user's appointments including past ones", async () => {
    const { accessToken } = await login();
    const list = AppointmentsResponseSchema.parse((await request(app).get('/api/advisor/appointments').set(auth(accessToken))).body);
    expect(list[0]).toMatchObject({ id: 'appt-sarah-1', status: 'completed' });
  });

  it('keeps a message thread and appends client messages', async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const before = AdvisorMessagesResponseSchema.parse((await request(app).get('/api/advisor/messages').set(auth(accessToken))).body);
    expect(before).toHaveLength(1);
    const sent = await request(app).post('/api/advisor/messages').set(auth(accessToken)).send({ text: '  Thanks Jordan!  ' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ from: 'client', text: 'Thanks Jordan!' });
    const after = AdvisorMessagesResponseSchema.parse((await request(app).get('/api/advisor/messages').set(auth(accessToken))).body);
    expect(after.at(-1)?.id).toBe(sent.body.id);
    expect((await request(app).post('/api/advisor/messages').set(auth(accessToken)).send({ text: '   ' })).status).toBe(400);
  });
});

describe('market', () => {
  it("flags securities the user holds in a visible account and has on the watchlist", async () => {
    const { accessToken } = await login();
    const quotes = QuotesResponseSchema.parse(
      (await request(app).get('/api/market/quote?symbols=xeqt.to,AAPL,NOPE').set(auth(accessToken))).body,
    );
    expect(quotes.map((q) => [q.symbol, q.held, q.watched])).toEqual([
      ['AAPL', false, true],
      ['XEQT.TO', true, true],
    ]);
  });

  it('returns a security with its description, or 404', async () => {
    const { accessToken } = await login();
    const zag = SecurityDetailSchema.parse((await request(app).get('/api/market/securities/zag.to').set(auth(accessToken))).body);
    expect(zag).toMatchObject({ symbol: 'ZAG.TO', held: true, watched: false, currency: 'CAD' });
    expect(zag.about).toBeTruthy();
    expect((await request(app).get('/api/market/securities/NOPE').set(auth(accessToken))).status).toBe(404);
  });

  it('returns history that ends at the current price', async () => {
    const { accessToken } = await login();
    for (const range of ['1D', '1M', '1Y', '5Y']) {
      const h = HistoryResponseSchema.parse(
        (await request(app).get(`/api/market/history?symbol=VFV.TO&range=${range}`).set(auth(accessToken))).body,
      );
      expect(h.series.length).toBeGreaterThan(10);
      expect(h.series.at(-1)?.c).toBe(14210);
    }
    expect((await request(app).get('/api/market/history?symbol=VFV.TO&range=2Y').set(auth(accessToken))).status).toBe(400);
  });

  it('searches by symbol or name', async () => {
    const { accessToken } = await login();
    const res = await request(app).get('/api/market/search?q=bank').set(auth(accessToken));
    expect(res.body.items.map((i: { symbol: string }) => i.symbol)).toEqual(['NA.TO']);
  });

  it('adds to and removes from the watchlist', async () => {
    const { accessToken } = await login('david.kim@example.com');
    const added = QuotesResponseSchema.parse((await request(app).put('/api/market/watchlist/ZAG.TO').set(auth(accessToken))).body);
    // Seeded entries share a timestamp, so they sort by symbol; the new one comes last.
    expect(added.map((q) => q.symbol)).toEqual(['AAPL', 'NA.TO', 'SHOP.TO', 'VFV.TO', 'XEQT.TO', 'ZAG.TO']);
    expect((await request(app).put('/api/market/watchlist/ZAG.TO').set(auth(accessToken))).body).toHaveLength(6);
    const removed = QuotesResponseSchema.parse((await request(app).delete('/api/market/watchlist/AAPL').set(auth(accessToken))).body);
    expect(removed.map((q) => q.symbol)).not.toContain('AAPL');
    expect((await request(app).put('/api/market/watchlist/NOPE').set(auth(accessToken))).status).toBe(404);
  });

  it('serves news, the weekly roundup and baskets', async () => {
    const { accessToken } = await login();
    expect((await request(app).get('/api/market/news').set(auth(accessToken))).body[0].id).toBe('n1');
    expect((await request(app).get('/api/market/roundup').set(auth(accessToken))).body).toMatchObject({ weekOf: '2024-12-01' });
    expect((await request(app).get('/api/market/baskets').set(auth(accessToken))).body).toHaveLength(4);
  });
});

describe('notifications', () => {
  it('lists notifications newest first with read state', async () => {
    const { accessToken } = await login();
    const list = NotificationsResponseSchema.parse((await request(app).get('/api/notifications').set(auth(accessToken))).body);
    expect(list.map((n) => n.id)).toEqual(['no1', 'no2', 'no3', 'no4', 'no5']);
    expect(list.filter((n) => !n.read).map((n) => n.id)).toEqual(['no1', 'no2']);
  });

  it('marks one notification read and persists it', async () => {
    const { accessToken } = await login('linda.rodriguez@example.com');
    const res = await request(app).post('/api/notifications/no-l1/read').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'no-l1', read: true });
    const list = NotificationsResponseSchema.parse((await request(app).get('/api/notifications').set(auth(accessToken))).body);
    expect(list.every((n) => n.read)).toBe(true);
  });

  it("returns 404 for another user's notification", async () => {
    const { accessToken } = await login('emma.wilson@example.com');
    const res = await request(app).post('/api/notifications/no1/read').set(auth(accessToken));
    expect(res.status).toBe(404);
  });

  it('marks all notifications read', async () => {
    const { accessToken } = await login('michael.thompson@example.com');
    const res = await request(app).post('/api/notifications/read-all').set(auth(accessToken));
    expect(res.body).toEqual({ updated: 1 });
    const again = await request(app).post('/api/notifications/read-all').set(auth(accessToken));
    expect(again.body).toEqual({ updated: 0 });
  });
});

describe('openapi', () => {
  it('serves the generated spec', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/api/wealth/dashboard']).toBeDefined();
  });
});
