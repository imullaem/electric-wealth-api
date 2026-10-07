import { PaginatedSchema, PaginationQuerySchema } from './common.js';
import { z } from './zod.js';

export const DocumentSchema = z
  .object({
    id: z.string().openapi({ example: 'd1' }),
    name: z.string().openapi({ example: '2024 T5 Tax Slip' }),
    category: z.string().openapi({ example: 'Tax' }),
    year: z.number().int(),
    accountId: z.string().nullable(),
    accountLabel: z.string().optional(),
    sizeBytes: z.number().int(),
    actionRequired: z.boolean(),
    url: z.string(),
  })
  .openapi('Document');

export type Document = z.infer<typeof DocumentSchema>;

export const DocumentsListResponseSchema = PaginatedSchema(DocumentSchema).openapi('DocumentsListResponse');

export const DocumentsQuerySchema = PaginationQuerySchema.extend({
  year: z.coerce.number().int().optional(),
  category: z.string().optional(),
});

export const DocumentDetailResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    contentType: z.string(),
    base64Stub: z.string(),
  })
  .openapi('DocumentDetailResponse');

export const DocumentIdParamsSchema = z.object({
  id: z.string().openapi({ example: 'd1' }),
});

export const DocumentShareRequestSchema = z
  .object({
    recipient: z.email().openapi({ example: 'accountant@example.com' }),
  })
  .openapi('DocumentShareRequest');

export const DocumentShareResponseSchema = z
  .object({
    recipient: z.email(),
    expiresAt: z.iso.datetime().openapi({ description: 'The shared link stops working after this time (7 days)' }),
  })
  .openapi('DocumentShareResponse');
