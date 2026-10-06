# electric-wealth-api

The REST API for **Electric Wealth**, a Canadian retail wealth-management web app. It's built with Express 5 and TypeScript, and reads and writes the SQLite database from **electric-wealth-db**.

| Repo | Role |
|---|---|
| electric-wealth-db | Schema, migrations, seed data |
| **electric-wealth-api** (this repo) | REST API. **Owns the API contract** (Zod schemas → `openapi.json`) |
| electric-wealth-web | Browser app. Generates its API types from this repo's `openapi.json` |

## Getting started

Prerequisite: **Node.js 22.13+**. Clone the three repos side by side:

```
some-folder/
  electric-wealth-db/
  electric-wealth-api/
  electric-wealth-web/
```

```bash
# 1. Build the database (once, or whenever you want fresh data)
cd ../electric-wealth-db
npm run db:reset

# 2. Run the API
cd ../electric-wealth-api
npm install
npm run dev
```

- API: http://localhost:4100
- **Interactive docs (Swagger UI): http://localhost:4100/docs**
- Raw spec: http://localhost:4100/openapi.json

Sign in as any demo persona (for example `sarah.chen@example.com`) with password `Demo123!` and MFA code `123456`. In Swagger, call `POST /api/auth/token`, then `POST /api/auth/mfa/verify` with that access token. Then click **Authorize** and paste the token.

Port 4100 is deliberate: the v1 mock server (ElectricWealthAIDE) uses 4000, so both can run side by side.

Optional settings go in `.env` (copy `.env.example`): `PORT`, `DB_PATH`, `CORS_ORIGINS`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with auto-restart on file changes |
| `npm test` | Run the API tests against a fresh temporary copy of the database |
| `npm run typecheck` | Type-check everything |
| `npm run gen:openapi` | Regenerate `openapi.json` from the Zod schemas and route registrations |
| `npm run check:openapi` | Fail if `openapi.json` is out of date. Run before committing |
| `npm run verify` | typecheck + check:openapi + tests: the "ready to push" check |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled build |

## How the code is organised

```
src/
  schemas/        Zod schemas: the API contract (requests + responses)
  routes/         Express handlers + OpenAPI path registrations, side by side
  repositories/   All SQL lives here; maps rows (snake_case) to API shapes (camelCase)
  middleware/     Auth, trace id, language, rate limit, error envelope, validation helper
  openapi/        Registry + document builder
  db/             SQLite connection (node:sqlite) and small row helpers
  app.ts          Express app factory (takes the db, so tests can pass their own)
  index.ts        Entry point
scripts/openapi.ts  gen:openapi / check:openapi
test/               Vitest + Supertest
openapi.json        Generated. Committed so reviewers and the web app can see it
```

A request flows like this: **route** → `parseOr400(Schema, input)` → **repository** (SQL) → `Schema.parse(response)` → JSON.

Responses are parsed through their Zod schema before they're sent. If the database returns something the contract doesn't allow, you get a 500 with a trace id instead of quietly sending bad data.

## The API contract and keeping the web app in sync

This API is **code-first**: the Zod schemas in `src/schemas/` are the single source of truth.

```
src/schemas/*.ts ──(npm run gen:openapi)──▶ openapi.json ──(web: npm run gen:api)──▶ web types
```

1. Change a Zod schema and/or a route (and its `registry.registerPath(...)` entry).
2. Run `npm run gen:openapi`. Review the `openapi.json` diff: it shows exactly how the contract changed.
3. Run `npm run verify` and commit the schema, route and `openapi.json` changes together.
4. In **electric-wealth-web**, run `npm run gen:api`. TypeScript then flags anything in the UI that no longer matches.

**Safe vs breaking changes:**
- **Safe:** adding an optional response field, or adding an optional request field.
- **Breaking:** removing or renaming a field, changing its type, or making an optional request field required.

For breaking changes, add the new field first, migrate the clients, then remove the old field later.

## Conventions

- **Money:** integers in minor units (cents), with an ISO currency code.
- **Errors:** always `{ "error": { "code", "message", "traceId" } }`. The trace id is also returned in the `X-Trace-Id` header and printed in the server log.
- **Paging:** `?page=1&pageSize=20` → `{ items, page, pageSize, total }`.
- **Language:** `Accept-Language: fr-CA` localizes server-provided labels (for example dashboard quick links).
- **Auth:** password login → MFA → Bearer access token (15 min) + refresh token. Sessions are stored in the `sessions` table.

> Auth is a **demo**: plain-text passwords and a fixed MFA code. Don't copy this into a real system.
