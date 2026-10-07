import { z } from './zod.js';

export const EducationLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']).openapi('EducationLevel');

export const EducationTypeSchema = z.enum(['class', 'challenge']).openapi('EducationType');

export const EducationContentSchema = z
  .object({
    id: z.string().openapi({ example: 'e1' }),
    title: z.string().openapi({ description: 'In the language from Accept-Language' }),
    level: EducationLevelSchema,
    type: EducationTypeSchema,
    durationMin: z.number().int(),
    progressPct: z.number().int().min(0).max(100),
  })
  .openapi('EducationContent');

export type EducationContent = z.infer<typeof EducationContentSchema>;

export const EducationContentResponseSchema = z.array(EducationContentSchema).openapi('EducationContentResponse');

export const EducationContentQuerySchema = z.object({
  level: EducationLevelSchema.optional(),
  type: EducationTypeSchema.optional(),
});

export const GlossaryEntrySchema = z
  .object({
    term: z.string(),
    definition: z.string(),
  })
  .openapi('GlossaryEntry');

export const GlossaryResponseSchema = z.array(GlossaryEntrySchema).openapi('GlossaryResponse');

export const GlossaryQuerySchema = z.object({
  q: z.string().trim().max(60).optional().openapi({ description: 'Matches the term or definition, case-insensitive' }),
});

export const EducationProgressRequestSchema = z
  .object({
    contentId: z.string(),
    progressPct: z.number().int().min(0).max(100),
  })
  .openapi('EducationProgressRequest');

export const EducationProgressResponseSchema = EducationProgressRequestSchema.openapi('EducationProgressResponse');
