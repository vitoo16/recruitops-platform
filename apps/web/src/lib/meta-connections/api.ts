import { z } from 'zod';

export const MetaConnectionTargetSchema = z.enum(['FACEBOOK', 'INSTAGRAM']);
export type MetaConnectionTarget = z.infer<typeof MetaConnectionTargetSchema>;

const InstagramProfessionalAccountSchema = z
  .object({
    id: z.string().min(1),
    username: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .strict();

export const MetaDiscoveredAccountSchema = z
  .object({
    pageId: z.string().min(1),
    pageName: z.string().min(1),
    tasks: z.array(z.string()),
    instagramProfessionalAccount: InstagramProfessionalAccountSchema.nullable(),
  })
  .strict();

const MetaStartResponseSchema = z
  .object({
    authorizationUrl: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const MetaSelectionResponseSchema = z
  .object({
    connectionSessionId: z.uuid(),
    expiresAt: z.iso.datetime({ offset: true }),
    targets: z.array(MetaConnectionTargetSchema).min(1).max(2),
    accounts: z.array(MetaDiscoveredAccountSchema),
  })
  .strict();

const MetaConnectedAccountSchema = z
  .object({
    socialAccountId: z.uuid(),
    destinationId: z.uuid(),
    platform: MetaConnectionTargetSchema,
    externalAccountId: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

const MetaSelectionCommitResponseSchema = z
  .object({ connected: z.array(MetaConnectedAccountSchema).min(1) })
  .strict();

export type MetaSelectionResponse = z.infer<typeof MetaSelectionResponseSchema>;

export type MetaAccountSelection =
  | { platform: 'FACEBOOK'; pageId: string }
  | { platform: 'INSTAGRAM'; pageId: string; instagramAccountId: string };

async function requestJson<TSchema extends z.ZodType>(
  schema: TSchema,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init?.body) headers.set('content-type', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) throw new Error(`meta_api_${response.status}`);
  return schema.parse(await response.json());
}

export async function startMetaConnection(
  apiUrl: string,
  accessToken: string,
  targets: readonly MetaConnectionTarget[],
) {
  return requestJson(
    MetaStartResponseSchema,
    `${apiUrl}/integrations/meta/oauth/start`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ targets }),
    },
  );
}

export async function getMetaSelection(
  apiUrl: string,
  accessToken: string,
  connectionSessionId: string,
): Promise<MetaSelectionResponse> {
  return requestJson(
    MetaSelectionResponseSchema,
    `${apiUrl}/integrations/meta/oauth/selection/${encodeURIComponent(connectionSessionId)}`,
    accessToken,
  );
}

export async function confirmMetaSelection(
  apiUrl: string,
  accessToken: string,
  connectionSessionId: string,
  accounts: readonly MetaAccountSelection[],
) {
  return requestJson(
    MetaSelectionCommitResponseSchema,
    `${apiUrl}/integrations/meta/oauth/select`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ connectionSessionId, accounts }),
    },
  );
}
