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

export const ProvinceSchema = z
  .enum(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])
  .openapi('Province');

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Canadian postal code, accepted with or without the space and in any case; stored as "A1A 1A1". */
const PostalCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, 'Must be a Canadian postal code, e.g. M5V 2A1')
  .transform((v) => {
    const compact = v.replace(' ', '').toUpperCase();
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  })
  .openapi({ example: 'M5V 2A1' });

export const ProfileAddressUpdateSchema = z
  .object({
    address: z.object({
      line1: requiredText(100),
      line2: z.string().trim().max(100).optional(),
      city: requiredText(60),
      province: ProvinceSchema,
      postalCode: PostalCodeSchema,
      country: z.literal('Canada'),
    }),
  })
  .openapi('ProfileAddressUpdate');

export type ProfileAddressUpdate = z.infer<typeof ProfileAddressUpdateSchema>;

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

/** Partial update: send only the fields to change. Notification flags can also be sent individually. */
export const PreferencesUpdateSchema = PreferencesResponseSchema.extend({
  notifications: NotificationPrefsSchema.partial(),
})
  .partial()
  .openapi('PreferencesUpdate');

export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;
