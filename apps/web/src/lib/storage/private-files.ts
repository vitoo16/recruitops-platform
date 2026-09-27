import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildPrivateObjectKey,
  objectKeyBelongsToUser,
  validatePrivateFileUpload,
  type PrivateFileUploadIntent,
  type PrivateFileUploadPolicy,
} from '@recruitops/contracts';

export const PRIVATE_STORAGE_BUCKET = 'recruitops-private';

export class PrivateFileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateFileAccessError';
  }
}

async function requireAuthenticatedUserId(
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new PrivateFileAccessError('AUTHENTICATION_REQUIRED');
  }

  return data.user.id;
}

export async function uploadPrivateFile(input: {
  client: SupabaseClient;
  intent: PrivateFileUploadIntent;
  policy: PrivateFileUploadPolicy;
  file: File;
}): Promise<{ bucket: string; objectKey: string }> {
  const userId = await requireAuthenticatedUserId(input.client);
  if (userId !== input.intent.ownerUserId) {
    throw new PrivateFileAccessError('OWNER_USER_MISMATCH');
  }

  const validation = validatePrivateFileUpload(input.intent, input.policy);
  if (!validation.valid) {
    throw new PrivateFileAccessError(validation.issues.join(','));
  }

  if (
    input.file.size !== input.intent.sizeBytes ||
    input.file.type !== input.intent.mimeType
  ) {
    throw new PrivateFileAccessError('FILE_METADATA_MISMATCH');
  }

  const objectKey = buildPrivateObjectKey(input.intent);
  const { error } = await input.client.storage
    .from(PRIVATE_STORAGE_BUCKET)
    .upload(objectKey, input.file, {
      contentType: input.intent.mimeType,
      upsert: false,
    });

  if (error) {
    throw new PrivateFileAccessError(`UPLOAD_FAILED:${error.message}`);
  }

  return { bucket: PRIVATE_STORAGE_BUCKET, objectKey };
}

export async function createPrivateDownloadUrl(input: {
  client: SupabaseClient;
  objectKey: string;
  expiresInSeconds: number;
}): Promise<string> {
  const userId = await requireAuthenticatedUserId(input.client);
  if (!objectKeyBelongsToUser(input.objectKey, userId)) {
    throw new PrivateFileAccessError('OBJECT_NOT_OWNED_BY_USER');
  }

  if (
    !Number.isInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > 900
  ) {
    throw new PrivateFileAccessError('INVALID_SIGNED_URL_TTL');
  }

  const { data, error } = await input.client.storage
    .from(PRIVATE_STORAGE_BUCKET)
    .createSignedUrl(input.objectKey, input.expiresInSeconds);

  if (error || !data.signedUrl) {
    throw new PrivateFileAccessError(
      `SIGNED_URL_FAILED:${error?.message ?? 'UNKNOWN'}`,
    );
  }

  return data.signedUrl;
}
