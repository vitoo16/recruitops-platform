import { z } from 'zod';

export const OAuthCredentialPayloadSchema = z
  .object({
    accessToken: z.string().min(1).max(16_384),
    refreshToken: z.string().min(1).max(16_384).optional(),
    tokenType: z.string().trim().min(1).max(64).optional(),
    scopes: z
      .array(z.string().trim().min(1).max(255))
      .max(200)
      .default([])
      .transform((scopes) => [...new Set(scopes)]),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    refreshExpiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type OAuthCredentialPayload = z.infer<typeof OAuthCredentialPayloadSchema>;
