import {
  AccountTypeSchema,
  CurrencySchema,
  MinorUnitsSchema,
  PaginatedSchema,
  PaginationQuerySchema,
  PerformanceRangeSchema,
  TransactionTypeSchema,
} from './common.js';
import { z } from './zod.js';

export const AccountSummarySchema = z
  .object({
    id: z.string().openapi({ example: 'tfsa' }),
    type: AccountTypeSchema,
    displayName: z.string().openapi({ example: 'Growth TFSA' }),
    nickname: z.string().nullable(),
    balance: MinorUnitsSchema,
    currency: CurrencySchema,
    hidden: z.boolean(),
    dayChange: z.number().int().optional(),
    dayChangePct: z.number().optional(),
    contributionRoom: z.number().int().nullable().optional(),
    taxStatus: z.string().openapi({ example: 'Tax-free' }),
    rateOfReturn: z.number().optional(),
  })
  .openapi('AccountSummary');

export type AccountSummary = z.infer<typeof AccountSummarySchema>;

export const AccountsListResponseSchema = PaginatedSchema(AccountSummarySchema).openapi('AccountsListResponse');

export const HoldingSchema = z
  .object({
    symbol: z.string().openapi({ example: 'XEQT.TO' }),
    name: z.string(),
    quantity: z.number(),
    marketValue: MinorUnitsSchema,
    currency: CurrencySchema,
    weightPct: z.number(),
  })
  .openapi('Holding');

export type Holding = z.infer<typeof HoldingSchema>;

export const AccountDetailSchema = AccountSummarySchema.extend({
  holdings: z.array(HoldingSchema),
}).openapi('AccountDetail');

export type AccountDetail = z.infer<typeof AccountDetailSchema>;

export const TransactionSchema = z
  .object({
    id: z.string(),
    date: z.iso.datetime(),
    description: z.string(),
    detail: z.string().optional(),
    type: TransactionTypeSchema,
    amount: MinorUnitsSchema,
    currency: CurrencySchema,
  })
  .openapi('Transaction');

export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionsResponseSchema = PaginatedSchema(TransactionSchema)
  .extend({ scheduled: z.array(TransactionSchema) })
  .openapi('TransactionsResponse');

export const TransactionsQuerySchema = PaginationQuerySchema.extend({
  type: TransactionTypeSchema.optional(),
});

export const PerformancePointSchema = z
  .object({
    t: z.string().openapi({ description: 'Period, e.g. 2024-03', example: '2024-03' }),
    v: z.number(),
  })
  .openapi('PerformancePoint');

export const PerformanceResponseSchema = z
  .object({
    range: PerformanceRangeSchema,
    timeWeightedReturnPct: z.number(),
    currency: CurrencySchema,
    series: z.array(PerformancePointSchema),
    benchmark: z.object({
      name: z.string(),
      series: z.array(PerformancePointSchema),
    }),
  })
  .openapi('PerformanceResponse');

export type PerformanceResponse = z.infer<typeof PerformanceResponseSchema>;

export const PerformanceQuerySchema = z.object({
  range: PerformanceRangeSchema.default('1Y'),
});

export const AccountPatchRequestSchema = z
  .object({
    nickname: z.string().max(40).nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .openapi('AccountPatchRequest');

export type AccountPatchRequest = z.infer<typeof AccountPatchRequestSchema>;

/** Account types a client can open online. The others are opened through an advisor. */
export const OpenableAccountTypeSchema = z.enum(['TFSA', 'RRSP', 'FHSA', 'NON_REGISTERED']).openapi('OpenableAccountType');

export const AccountOpenRequestSchema = z
  .object({
    type: OpenableAccountTypeSchema,
    displayName: z.string().trim().min(1).max(40).openapi({ example: 'Travel TFSA' }),
    nickname: z.string().trim().max(40).optional(),
  })
  .openapi('AccountOpenRequest');

export type AccountOpenRequest = z.infer<typeof AccountOpenRequestSchema>;

export const AccountIdParamsSchema = z.object({
  id: z.string().openapi({ example: 'tfsa' }),
});
