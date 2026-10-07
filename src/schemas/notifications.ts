import { NotificationTypeSchema } from './common.js';
import { z } from './zod.js';

export const NotificationSchema = z
  .object({
    id: z.string().openapi({ example: 'no1' }),
    title: z.string(),
    body: z.string(),
    type: NotificationTypeSchema,
    createdAt: z.iso.datetime(),
    read: z.boolean(),
  })
  .openapi('Notification');

export type Notification = z.infer<typeof NotificationSchema>;

/** Newest first. */
export const NotificationsResponseSchema = z.array(NotificationSchema).openapi('NotificationsResponse');

export const NotificationReadResponseSchema = z
  .object({
    id: z.string(),
    read: z.literal(true),
  })
  .openapi('NotificationReadResponse');

export const NotificationsReadAllResponseSchema = z
  .object({
    updated: z.number().int().nonnegative().openapi({ description: 'How many notifications were unread' }),
  })
  .openapi('NotificationsReadAllResponse');

export const NotificationIdParamsSchema = z.object({
  id: z.string().openapi({ example: 'no1' }),
});
