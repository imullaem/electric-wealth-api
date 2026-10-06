import { DocumentDeliverySchema, LanguageSchema, MeetingTypeSchema, ThemeSchema } from './common.js';
import { z } from './zod.js';

export const AddressSchema = z
  .object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .openapi('Address');

export const TrustedContactSchema = z
  .object({
    name: z.string(),
    relationship: z.string(),
  })
  .openapi('TrustedContact');

export const ProfileResponseSchema = z
  .object({
    name: z.string(),
    email: z.email(),
    phoneMasked: z.string(),
    dateOfBirth: z.string(),
    sinMasked: z.string().optional(),
    memberSince: z.number().int(),
    address: AddressSchema,
    trustedContact: TrustedContactSchema.optional(),
  })
  .openapi('ProfileResponse');

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const NotificationPrefsSchema = z
  .object({
    email: z.boolean(),
    sms: z.boolean(),
    push: z.boolean(),
  })
  .openapi('NotificationPrefs');

export const PreferencesResponseSchema = z
  .object({
    notifications: NotificationPrefsSchema,
    documentDelivery: DocumentDeliverySchema,
    language: LanguageSchema,
    theme: ThemeSchema,
    defaultMeetingType: MeetingTypeSchema,
  })
  .openapi('PreferencesResponse');

export type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;

export const PreferencesUpdateSchema = PreferencesResponseSchema.partial().openapi('PreferencesUpdate');

export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;
