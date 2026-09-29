import { z } from 'zod';

const LinkedInAccountStatusSchema = z.enum(['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR']);

export const LinkedInConnectedAccountSchema = z
  .object({
    id: z.uuid(),
    externalAccountId: z.string().min(1),
    displayName: z.string().min(1),
    status: LinkedInAccountStatusSchema,
    scopes: z.array(z.string()),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const LinkedInAccountsResponseSchema = z
  .object({
    accounts: z.array(LinkedInConnectedAccountSchema),
  })
  .strict();

const LinkedInStartResponseSchema = z
  .object({
    authorizationUrl: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type LinkedInConnectedAccount = z.infer<typeof LinkedInConnectedAccountSchema>;

async function requestJson<TSchema extends z.ZodType>(
  schema: TSchema,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`linkedin_api_${response.status}`);
  return schema.parse(await response.json());
}

export async function listLinkedInAccounts(apiUrl: string, accessToken: string) {
  return requestJson(
    LinkedInAccountsResponseSchema,
    `${apiUrl}/integrations/linkedin/oauth/accounts`,
    accessToken,
  );
}

export async function startLinkedInConnection(apiUrl: string, accessToken: string) {
  return requestJson(
    LinkedInStartResponseSchema,
    `${apiUrl}/integrations/linkedin/oauth/start`,
    accessToken,
    { method: 'POST' },
  );
}
