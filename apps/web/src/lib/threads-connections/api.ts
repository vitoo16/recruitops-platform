import { z } from 'zod';

const ThreadsAccountStatusSchema = z.enum(['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR']);

export const ThreadsConnectedAccountSchema = z
  .object({
    id: z.uuid(),
    externalAccountId: z.string().min(1),
    displayName: z.string().min(1),
    status: ThreadsAccountStatusSchema,
    scopes: z.array(z.string()),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const ThreadsAccountsResponseSchema = z
  .object({
    accounts: z.array(ThreadsConnectedAccountSchema),
  })
  .strict();

const ThreadsStartResponseSchema = z
  .object({
    authorizationUrl: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ThreadsConnectedAccount = z.infer<typeof ThreadsConnectedAccountSchema>;

async function requestJson<TSchema extends z.ZodType>(
  schema: TSchema,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`threads_api_${response.status}`);
  return schema.parse(await response.json());
}

export async function listThreadsAccounts(apiUrl: string, accessToken: string) {
  return requestJson(
    ThreadsAccountsResponseSchema,
    `${apiUrl}/integrations/threads/oauth/accounts`,
    accessToken,
  );
}

export async function startThreadsConnection(apiUrl: string, accessToken: string) {
  return requestJson(
    ThreadsStartResponseSchema,
    `${apiUrl}/integrations/threads/oauth/start`,
    accessToken,
    { method: 'POST' },
  );
}
