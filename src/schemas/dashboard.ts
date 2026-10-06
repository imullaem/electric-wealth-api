import { AlertTypeSchema, CurrencySchema, MinorUnitsSchema } from './common.js';
import { z } from './zod.js';

export const PortfolioSummarySchema = z
  .object({
    totalValue: MinorUnitsSchema.openapi({ description: 'Sum of visible account balances (minor units)' }),
    currency: CurrencySchema,
    dayChange: z.number().int(),
    dayChangePct: z.number(),
    asOf: z.iso.datetime(),
  })
  .openapi('PortfolioSummary');

export const AllocationItemSchema = z
  .object({
    assetClass: z.string().openapi({ example: 'Equity' }),
    pct: z.number(),
  })
  .openapi('AllocationItem');

export const DashboardGoalSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    progressPct: z.number(),
  })
  .openapi('DashboardGoalSummary');

export const DashboardAlertSchema = z
  .object({
    id: z.string(),
    type: AlertTypeSchema,
    title: z.string(),
    deepLink: z.string().optional().openapi({ example: 'electricwealth://documents/d1' }),
  })
  .openapi('DashboardAlert');

export const QuickLinkSchema = z
  .object({
    label: z.string(),
    deepLink: z.string().openapi({ example: 'electricwealth://documents' }),
  })
  .openapi('QuickLink');

export const DashboardResponseSchema = z
  .object({
    portfolio: PortfolioSummarySchema,
    allocation: z.array(AllocationItemSchema),
    goals: z.array(DashboardGoalSummarySchema),
    alerts: z.array(DashboardAlertSchema),
    quickLinks: z.array(QuickLinkSchema),
  })
  .openapi('DashboardResponse');

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
