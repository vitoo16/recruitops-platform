import { z } from 'zod';
import { SocialPlatformSchema } from './content.js';
import { SocialAccountStatusSchema } from './social.js';

export const IntegrationReconnectReasonSchema = z.enum([
  'MISSING_CREDENTIAL',
  'EXPIRED',
  'REVOKED',
  'ERROR',
]);

export const IntegrationProviderStatusSchema = z.enum([
  'NOT_CONFIGURED',
  'DISCONNECTED',
  'HEALTHY',
  'RECONNECT_REQUIRED',
]);

export const IntegrationAccountHealthSchema = z
  .object({
    id: z.uuid(),
    platform: SocialPlatformSchema,
    displayName: z.string().trim().min(1).max(160),
    status: SocialAccountStatusSchema,
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    requiresReconnect: z.boolean(),
    reconnectReason: IntegrationReconnectReasonSchema.optional(),
  })
  .strict();

export const MetaIntegrationHealthSchema = z
  .object({
    provider: z.literal('META'),
    configured: z.boolean(),
    status: IntegrationProviderStatusSchema,
    accounts: z.array(IntegrationAccountHealthSchema),
  })
  .strict();

export const IntegrationHealthResponseSchema = z
  .object({
    meta: MetaIntegrationHealthSchema,
  })
  .strict();

export type IntegrationReconnectReason = z.infer<typeof IntegrationReconnectReasonSchema>;
export type IntegrationProviderStatus = z.infer<typeof IntegrationProviderStatusSchema>;
export type IntegrationAccountHealth = z.infer<typeof IntegrationAccountHealthSchema>;
export type MetaIntegrationHealth = z.infer<typeof MetaIntegrationHealthSchema>;
export type IntegrationHealthResponse = z.infer<typeof IntegrationHealthResponseSchema>;
