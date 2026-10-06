import { z } from './zod.js';

export const CurrencySchema = z.string().length(3).openapi({ description: 'ISO-4217 currency code', example: 'CAD' });

/** Money amounts are integers in minor units (cents). */
export const MinorUnitsSchema = z.number().int().openapi({ description: 'Amount in minor units (cents)', example: 3241000 });

export const PaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  });

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
});

export const LanguageSchema = z.enum(['en-CA', 'fr-CA']).openapi('Language');

export const ThemeSchema = z.enum(['light', 'dark', 'system']).openapi('Theme');

export const MeetingTypeSchema = z.enum(['video', 'phone', 'in_person']).openapi('MeetingType');

export const DocumentDeliverySchema = z.enum(['digital', 'paper_and_digital']).openapi('DocumentDelivery');

export const PerformanceRangeSchema = z.enum(['1M', '1Y', 'ALL']).openapi('PerformanceRange');

export const TransactionTypeSchema = z
  .enum(['contribution', 'buy', 'sell', 'dividend', 'fee', 'withdrawal', 'transfer', 'scheduled'])
  .openapi('TransactionType');

export const AccountTypeSchema = z
  .enum(['TFSA', 'RRSP', 'RESP', 'RDSP', 'FHSA', 'NON_REGISTERED', 'LIRA', 'RRIF'])
  .openapi('AccountType');

export const AlertTypeSchema = z.enum(['ACTION_REQUIRED', 'INFO', 'SUCCESS', 'WARNING']).openapi('AlertType');

export const MfaMethodSchema = z.enum(['sms', 'email']).openapi('MfaMethod');
