import {
  PublicationManualRetryResponseSchema,
  PublicationStatusListSchema,
  PublishNowReadinessSchema,
  PublishNowResponseSchema,
  SchedulePublicationResponseSchema,
  type PublishNowCommand,
  type SchedulePublicationCommand,
} from '@recruitops/contracts';
import { z } from 'zod';

export class PublicationApiError extends Error {
  constructor(public readonly status: number) {
    super(`publication_api_${status}`);
    this.name = 'PublicationApiError';
  }
}

async function requestJson<TSchema extends z.ZodType>(
  schema: TSchema,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init?.body) headers.set('content-type', 'application/json');

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new PublicationApiError(response.status);
  return schema.parse(await response.json());
}

export function getPublishNowReadiness(apiUrl: string, accessToken: string, postVariantId: string) {
  return requestJson(
    PublishNowReadinessSchema,
    `${apiUrl}/publications/publish-now/readiness/${encodeURIComponent(postVariantId)}`,
    accessToken,
  );
}

export function queuePublishNow(apiUrl: string, accessToken: string, command: PublishNowCommand) {
  return requestJson(PublishNowResponseSchema, `${apiUrl}/publications/publish-now`, accessToken, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export function schedulePublication(
  apiUrl: string,
  accessToken: string,
  command: SchedulePublicationCommand,
) {
  return requestJson(SchedulePublicationResponseSchema, `${apiUrl}/publications/schedule`, accessToken, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export function getPublicationStatus(apiUrl: string, accessToken: string, postVariantId: string) {
  return requestJson(
    PublicationStatusListSchema,
    `${apiUrl}/publications/status/${encodeURIComponent(postVariantId)}`,
    accessToken,
  );
}

export function retryPublication(apiUrl: string, accessToken: string, publicationId: string) {
  return requestJson(
    PublicationManualRetryResponseSchema,
    `${apiUrl}/publications/${encodeURIComponent(publicationId)}/retry`,
    accessToken,
    { method: 'POST' },
  );
}
