import { z } from 'zod';

const AccountSchema = z
  .object({
    id: z.uuid(),
    externalAccountId: z.string().min(1),
    displayName: z.string().min(1),
    status: z.enum(['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR']),
    scopes: z.array(z.string()),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
const AccountsResponseSchema = z.object({ accounts: z.array(AccountSchema) }).strict();
const StartResponseSchema = z
  .object({ authorizationUrl: z.url(), expiresAt: z.iso.datetime({ offset: true }) })
  .strict();

export type TikTokConnectedAccount = z.infer<typeof AccountSchema>;

async function request<T extends z.ZodType>(
  schema: T,
  url: string,
  token: string,
  init?: RequestInit,
): Promise<z.output<T>> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`tiktok_api_${response.status}`);
  return schema.parse(await response.json());
}

export function listTikTokAccounts(apiUrl: string, token: string) {
  return request(AccountsResponseSchema, `${apiUrl}/integrations/tiktok/oauth/accounts`, token);
}

export function startTikTokConnection(apiUrl: string, token: string) {
  return request(StartResponseSchema, `${apiUrl}/integrations/tiktok/oauth/start`, token, {
    method: 'POST',
  });
}
