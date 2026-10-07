import { CurrencySchema } from './common.js';
import { z } from './zod.js';

export const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.]{1,12}$/, 'Not a valid symbol')
  .openapi({ example: 'XEQT.TO' });

export const QuoteSchema = z
  .object({
    symbol: z.string(),
    name: z.string(),
    exchange: z.string(),
    price: z.number().int().openapi({ description: 'Last price, minor units of currency' }),
    currency: CurrencySchema,
    change: z.number().int().openapi({ description: 'Change since previous close, minor units' }),
    changePct: z.number(),
    held: z.boolean().openapi({ description: 'The signed-in user holds this security in a visible account' }),
    watched: z.boolean().openapi({ description: "On the signed-in user's watchlist" }),
  })
  .openapi('Quote');

export type Quote = z.infer<typeof QuoteSchema>;

export const QuotesResponseSchema = z.array(QuoteSchema).openapi('QuotesResponse');

export const QuoteQuerySchema = z.object({
  symbols: z
    .string()
    .optional()
    .openapi({ description: 'Comma-separated symbols. Omit for every listed security.', example: 'XEQT.TO,AAPL' }),
});

export const SecurityDetailSchema = QuoteSchema.extend({
  about: z.string().optional(),
}).openapi('SecurityDetail');

export const HistoryRangeSchema = z.enum(['1D', '1M', '1Y', '5Y']).openapi('HistoryRange');

export const HistoryQuerySchema = z.object({
  symbol: SymbolSchema,
  range: HistoryRangeSchema.default('1Y'),
});

export const HistoryResponseSchema = z
  .object({
    symbol: z.string(),
    range: HistoryRangeSchema,
    currency: CurrencySchema,
    series: z.array(
      z.object({
        t: z.string().openapi({ description: 'HH:MM for 1D, YYYY-MM-DD for 1M, YYYY-MM for 1Y and 5Y' }),
        c: z.number().int().openapi({ description: 'Close, minor units' }),
      }),
    ),
  })
  .openapi('HistoryResponse');

export const SearchQuerySchema = z.object({
  q: z.string().trim().max(40).optional(),
});

export const SearchResponseSchema = z
  .object({
    items: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        exchange: z.string(),
        currency: CurrencySchema,
      }),
    ),
  })
  .openapi('SearchResponse');

export const NewsResponseSchema = z
  .array(
    z.object({
      id: z.string(),
      title: z.string(),
      source: z.string(),
      publishedAt: z.iso.datetime(),
      tag: z.string().optional(),
    }),
  )
  .openapi('NewsResponse');

export const BasketsResponseSchema = z
  .array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      return1YPct: z.number(),
      holdings: z.number().int(),
      risk: z.enum(['Low', 'Medium', 'High']),
    }),
  )
  .openapi('BasketsResponse');

export const RoundupResponseSchema = z
  .object({
    weekOf: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        publishedAt: z.iso.datetime(),
      }),
    ),
  })
  .openapi('RoundupResponse');

export const SymbolParamsSchema = z.object({ symbol: SymbolSchema });
