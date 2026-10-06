import { Router } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, localizeLabel, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import {
  findAccount,
  findPerformance,
  listHoldings,
  listPostedTransactions,
  listScheduledTransactions,
  listVisibleAccounts,
  updateAccount,
} from '../repositories/accounts.js';
import { getDashboard } from '../repositories/dashboard.js';
import { findDocument, listDocuments } from '../repositories/documents.js';
import {
  AccountDetailSchema,
  AccountIdParamsSchema,
  AccountPatchRequestSchema,
  AccountsListResponseSchema,
  PerformanceQuerySchema,
  PerformanceResponseSchema,
  TransactionsQuerySchema,
  TransactionsResponseSchema,
} from '../schemas/accounts.js';
import { LanguageSchema, PaginationQuerySchema } from '../schemas/common.js';
import { DashboardResponseSchema } from '../schemas/dashboard.js';
import {
  DocumentDetailResponseSchema,
  DocumentIdParamsSchema,
  DocumentsListResponseSchema,
  DocumentsQuerySchema,
} from '../schemas/documents.js';
import { z } from '../schemas/zod.js';

// ---------------------------------------------------------------------------
// OpenAPI definitions
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/wealth/dashboard',
  tags: ['Dashboard'],
  summary: 'Portfolio summary, allocation, goals, alerts and quick links',
  security: secured,
  request: { headers: z.object({ 'accept-language': LanguageSchema.optional() }) },
  responses: { 200: jsonBody(DashboardResponseSchema, 'Dashboard'), ...errors(401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/accounts',
  tags: ['Accounts'],
  summary: 'List visible accounts',
  security: secured,
  request: { query: PaginationQuerySchema },
  responses: { 200: jsonBody(AccountsListResponseSchema, 'Accounts'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/accounts/{id}',
  tags: ['Accounts'],
  summary: 'Account detail with holdings',
  security: secured,
  request: { params: AccountIdParamsSchema },
  responses: { 200: jsonBody(AccountDetailSchema, 'Account detail'), ...errors(401, 404) },
});

registry.registerPath({
  method: 'patch',
  path: '/api/wealth/accounts/{id}',
  tags: ['Accounts'],
  summary: 'Update an account nickname or visibility',
  security: secured,
  request: { params: AccountIdParamsSchema, body: jsonBody(AccountPatchRequestSchema) },
  responses: { 200: jsonBody(AccountDetailSchema, 'Updated account'), ...errors(400, 401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/accounts/{id}/transactions',
  tags: ['Accounts'],
  summary: 'Posted transactions (paged) plus upcoming scheduled transactions',
  security: secured,
  request: { params: AccountIdParamsSchema, query: TransactionsQuerySchema },
  responses: { 200: jsonBody(TransactionsResponseSchema, 'Transactions'), ...errors(400, 401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/accounts/{id}/performance',
  tags: ['Accounts'],
  summary: 'Account performance series with benchmark',
  security: secured,
  request: { params: AccountIdParamsSchema, query: PerformanceQuerySchema },
  responses: { 200: jsonBody(PerformanceResponseSchema, 'Performance'), ...errors(400, 401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/documents',
  tags: ['Documents'],
  summary: 'List documents (tax slips, statements, confirmations, legal)',
  security: secured,
  request: { query: DocumentsQuerySchema },
  responses: { 200: jsonBody(DocumentsListResponseSchema, 'Documents'), ...errors(400, 401) },
});

registry.registerPath({
  method: 'get',
  path: '/api/wealth/documents/{id}',
  tags: ['Documents'],
  summary: 'Document download stub',
  security: secured,
  request: { params: DocumentIdParamsSchema },
  responses: { 200: jsonBody(DocumentDetailResponseSchema, 'Document'), ...errors(401, 404) },
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createWealthRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  router.get('/dashboard', (req, res) => {
    const dashboard = getDashboard(db, req.userId!);
    if (!dashboard) {
      sendError(req, res, 404, 'NOT_FOUND', 'Dashboard not found.');
      return;
    }
    dashboard.quickLinks = dashboard.quickLinks.map((l) => ({ ...l, label: localizeLabel(l.label, req.language) }));
    res.json(DashboardResponseSchema.parse(dashboard));
  });

  router.get('/accounts', (req, res) => {
    const query = parseOr400(PaginationQuerySchema, req.query, req, res);
    if (!query) return;
    const { items, total } = listVisibleAccounts(db, req.userId!, query.page, query.pageSize);
    res.json(AccountsListResponseSchema.parse({ items, total, page: query.page, pageSize: query.pageSize }));
  });

  router.get('/accounts/:id', (req, res) => {
    const account = findAccount(db, req.userId!, req.params.id);
    if (!account) {
      sendError(req, res, 404, 'NOT_FOUND', 'Account not found.');
      return;
    }
    const holdings = listHoldings(db, req.userId!, account.id);
    res.json(AccountDetailSchema.parse({ ...account, holdings }));
  });

  router.patch('/accounts/:id', (req, res) => {
    const patch = parseOr400(AccountPatchRequestSchema, req.body, req, res);
    if (!patch) return;
    if (!findAccount(db, req.userId!, req.params.id)) {
      sendError(req, res, 404, 'NOT_FOUND', 'Account not found.');
      return;
    }
    updateAccount(db, req.userId!, req.params.id, patch);
    const account = findAccount(db, req.userId!, req.params.id)!;
    const holdings = listHoldings(db, req.userId!, account.id);
    res.json(AccountDetailSchema.parse({ ...account, holdings }));
  });

  router.get('/accounts/:id/transactions', (req, res) => {
    const query = parseOr400(TransactionsQuerySchema, req.query, req, res);
    if (!query) return;
    if (!findAccount(db, req.userId!, req.params.id)) {
      sendError(req, res, 404, 'NOT_FOUND', 'Account not found.');
      return;
    }
    const { items, total } = listPostedTransactions(db, req.userId!, req.params.id, query);
    const scheduled = listScheduledTransactions(db, req.userId!, req.params.id);
    res.json(TransactionsResponseSchema.parse({ items, total, page: query.page, pageSize: query.pageSize, scheduled }));
  });

  router.get('/accounts/:id/performance', (req, res) => {
    const query = parseOr400(PerformanceQuerySchema, req.query, req, res);
    if (!query) return;
    const perf = findPerformance(db, req.userId!, req.params.id);
    if (!perf) {
      sendError(req, res, 404, 'NOT_FOUND', 'Performance data not found.');
      return;
    }
    res.json(
      PerformanceResponseSchema.parse({
        range: query.range,
        timeWeightedReturnPct: perf.timeWeightedReturnPct,
        currency: perf.currency,
        series: perf.series,
        benchmark: { name: perf.benchmarkName, series: perf.benchmarkSeries },
      }),
    );
  });

  router.get('/documents', (req, res) => {
    const query = parseOr400(DocumentsQuerySchema, req.query, req, res);
    if (!query) return;
    const { items, total } = listDocuments(db, req.userId!, query);
    res.json(DocumentsListResponseSchema.parse({ items, total, page: query.page, pageSize: query.pageSize }));
  });

  router.get('/documents/:id', (req, res) => {
    const doc = findDocument(db, req.userId!, req.params.id);
    if (!doc) {
      sendError(req, res, 404, 'NOT_FOUND', 'Document not found.');
      return;
    }
    res.json(
      DocumentDetailResponseSchema.parse({
        id: doc.id,
        name: doc.name,
        url: doc.url,
        contentType: 'application/pdf',
        base64Stub: 'JVBERi0xLjQK',
      }),
    );
  });

  return router;
}
