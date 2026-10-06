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
import { PreferencesResponseSchema } from '../src/schemas/profile.js';

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
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', dbRepoReset, '--db', dbPath], {
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

describe('preferences', () => {
  it('updates language and keeps other preferences', async () => {
    const { accessToken } = await login('david.kim@example.com');
    const res = await request(app).put('/api/preferences').set(auth(accessToken)).send({ language: 'fr-CA' });
    const prefs = PreferencesResponseSchema.parse(res.body);
    expect(prefs.language).toBe('fr-CA');
    expect(prefs.theme).toBe('dark');
  });
});

describe('openapi', () => {
  it('serves the generated spec', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/api/wealth/dashboard']).toBeDefined();
  });
});
