import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import {
  addToWatchlist,
  findSecurity,
  latestRoundup,
  listBaskets,
  listNews,
  listQuotes,
  listWatchlist,
  priceHistory,
  removeFromWatchlist,
  searchSecurities,
} from '../repositories/market.js';
import {
  BasketsResponseSchema,
  HistoryQuerySchema,
  HistoryResponseSchema,
  NewsResponseSchema,
  QuoteQuerySchema,
  QuotesResponseSchema,
  RoundupResponseSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  SecurityDetailSchema,
  SymbolParamsSchema,
} from '../schemas/market.js';

const get = (path: string, summary: string, response: Parameters<typeof jsonBody>[0], extra: object = {}, codes = [401]) =>
  registry.registerPath({
    method: 'get',
    path,
    tags: ['Market'],
    summary,
    security: secured,
    ...extra,
    responses: { 200: jsonBody(response, summary), ...errors(...codes) },
  });

get('/api/market/quote', 'Quotes, with held and watched flags for the user', QuotesResponseSchema, { request: { query: QuoteQuerySchema } });
get('/api/market/securities/{symbol}', 'One security with its quote and description', SecurityDetailSchema, { request: { params: SymbolParamsSchema } }, [400, 401, 404]);
get('/api/market/history', 'Closing prices over a range', HistoryResponseSchema, { request: { query: HistoryQuerySchema } }, [400, 401, 404]);
get('/api/market/search', 'Find securities by symbol or name', SearchResponseSchema, { request: { query: SearchQuerySchema } }, [400, 401]);
get('/api/market/news', 'Market headlines, newest first', NewsResponseSchema);
get('/api/market/roundup', "This week's market roundup", RoundupResponseSchema);
get('/api/market/baskets', 'Thematic baskets', BasketsResponseSchema);
get('/api/market/watchlist', "Quotes for the user's watchlist, in the order added", QuotesResponseSchema);

for (const method of ['put', 'delete'] as const) {
  registry.registerPath({
    method,
    path: '/api/market/watchlist/{symbol}',
    tags: ['Market'],
    summary: method === 'put' ? 'Add a security to the watchlist (no-op if already there)' : 'Remove a security from the watchlist',
    security: secured,
    request: { params: SymbolParamsSchema },
    responses: { 200: jsonBody(QuotesResponseSchema, 'The updated watchlist'), ...errors(400, 401, 404) },
  });
}

export function createMarketRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/quote', (req, res) => {
    const query = parseOr400(QuoteQuerySchema, req.query, req, res);
    if (!query) return;
    const symbols = query.symbols?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    res.json(QuotesResponseSchema.parse(listQuotes(db, req.userId!, symbols)));
  });

  router.get('/securities/:symbol', (req, res) => {
    const params = parseOr400(SymbolParamsSchema, req.params, req, res);
    if (!params) return;
    const security = findSecurity(db, req.userId!, params.symbol);
    if (!security) {
      sendError(req, res, 404, 'NOT_FOUND', `Unknown symbol ${params.symbol}.`);
      return;
    }
    res.json(SecurityDetailSchema.parse(security));
  });

  router.get('/history', (req, res) => {
    const query = parseOr400(HistoryQuerySchema, req.query, req, res);
    if (!query) return;
    const security = findSecurity(db, req.userId!, query.symbol);
    if (!security) {
      sendError(req, res, 404, 'NOT_FOUND', `Unknown symbol ${query.symbol}.`);
      return;
    }
    res.json(
      HistoryResponseSchema.parse({
        symbol: security.symbol,
        range: query.range,
        currency: security.currency,
        series: priceHistory(db, security.symbol, query.range),
      }),
    );
  });

  router.get('/search', (req, res) => {
    const query = parseOr400(SearchQuerySchema, req.query, req, res);
    if (!query) return;
    res.json(SearchResponseSchema.parse({ items: searchSecurities(db, query.q) }));
  });

  router.get('/news', (_req, res) => {
    res.json(NewsResponseSchema.parse(listNews(db)));
  });

  router.get('/roundup', (_req, res) => {
    res.json(RoundupResponseSchema.parse(latestRoundup(db)));
  });

  router.get('/baskets', (_req, res) => {
    res.json(BasketsResponseSchema.parse(listBaskets(db)));
  });

  router.get('/watchlist', (req, res) => {
    res.json(QuotesResponseSchema.parse(listWatchlist(db, req.userId!)));
  });

  router.put('/watchlist/:symbol', (req, res) => {
    const params = parseOr400(SymbolParamsSchema, req.params, req, res);
    if (!params) return;
    if (!findSecurity(db, req.userId!, params.symbol)) {
      sendError(req, res, 404, 'NOT_FOUND', `Unknown symbol ${params.symbol}.`);
      return;
    }
    addToWatchlist(db, req.userId!, params.symbol);
    res.json(QuotesResponseSchema.parse(listWatchlist(db, req.userId!)));
  });

  router.delete('/watchlist/:symbol', (req, res) => {
    const params = parseOr400(SymbolParamsSchema, req.params, req, res);
    if (!params) return;
    removeFromWatchlist(db, req.userId!, params.symbol);
    res.json(QuotesResponseSchema.parse(listWatchlist(db, req.userId!)));
  });

  return router;
}
