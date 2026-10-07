import { GoalCategorySchema, IsoDateSchema, MinorUnitsSchema, PaginatedSchema } from './common.js';
import { z } from './zod.js';

export const GoalSchema = z
  .object({
    id: z.string().openapi({ example: 'goal-1' }),
    name: z.string(),
    category: GoalCategorySchema,
    currentAmount: MinorUnitsSchema,
    targetAmount: MinorUnitsSchema,
    currency: z.string().length(3),
    targetDate: IsoDateSchema,
    progressPct: z.number().openapi({ description: 'currentAmount / targetAmount, as a percentage (0-100)' }),
  })
  .openapi('Goal');

export type Goal = z.infer<typeof GoalSchema>;

export const GoalsListResponseSchema = PaginatedSchema(GoalSchema).openapi('GoalsListResponse');

const MAX_AMOUNT = 100_000_000_00; // $100M in cents

export const GoalCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    category: GoalCategorySchema,
    targetAmount: MinorUnitsSchema.positive().max(MAX_AMOUNT),
    currentAmount: MinorUnitsSchema.nonnegative().max(MAX_AMOUNT).optional().openapi({ description: 'Defaults to 0' }),
    currency: z.literal('CAD'),
    targetDate: IsoDateSchema.refine((d) => d > new Date().toISOString().slice(0, 10), 'Must be a future date'),
  })
  .refine((g) => (g.currentAmount ?? 0) <= g.targetAmount, {
    message: 'currentAmount cannot exceed targetAmount',
    path: ['currentAmount'],
  })
  .openapi('GoalCreateRequest');

export type GoalCreateRequest = z.infer<typeof GoalCreateRequestSchema>;
