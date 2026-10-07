# electric-wealth-api

The API for Electric Wealth.

## Getting started

Prerequisite: **Node.js 24** (workshop standard: 24.19.0, see `.nvmrc`). Clone the three repos side by side:

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

The API runs at http://localhost:4100.

Optional settings go in `.env` (copy `.env.example`): `PORT`, `DB_PATH`, `CORS_ORIGINS`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with auto-restart on file changes |
| `npm test` | Run the tests |
| `npm run typecheck` | Type-check everything |
| `npm run gen:openapi` | Regenerate `openapi.json` |
| `npm run check:openapi` | Fail if `openapi.json` is out of date |
| `npm run verify` | typecheck + check:openapi + tests: the "ready to push" check |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled build |
