import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildPrivateObjectKey,
  objectKeyBelongsToUser,
  validatePrivateFileUpload,
  type PrivateFileUploadIntent,
  type PrivateFileUploadPolicy,
} from '@recruitops/contracts';

export const PRIVATE_STORAGE_BUCKET = 'recruitops-private';

type StorageRole = 'OWNER' | 'ADMIN' | 'RECRUITER' | 'VIEWER';

interface StoragePrincipal {
  id: string;
  role: StorageRole;
}

export class PrivateFileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateFileAccessError';
  }
}

function parseStorageRole(value: unknown): StorageRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'RECRUITER' || value === 'VIEWER'
    ? value
    : 'VIEWER';
}

async function requireAuthenticatedPrincipal(client: SupabaseClient): Promise<StoragePrincipal> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new PrivateFileAccessError('AUTHENTICATION_REQUIRED');
  }

  return {
    id: data.user.id,
    role: parseStorageRole(data.user.app_metadata?.recruitops_role),
  };
}

export async function uploadPrivateFile(input: {
  client: SupabaseClient;
  intent: PrivateFileUploadIntent;
  policy: PrivateFileUploadPolicy;
  file: File;
}): Promise<{ bucket: string; objectKey: string }> {
  const principal = await requireAuthenticatedPrincipal(input.client);
  if (principal.id !== input.intent.ownerUserId) {
    throw new PrivateFileAccessError('OWNER_USER_MISMATCH');
  }

  const validation = validatePrivateFileUpload(input.intent, input.policy);
  if (!validation.valid) {
    throw new PrivateFileAccessError(validation.issues.join(','));
  }

  if (input.file.size !== input.intent.sizeBytes || input.file.type !== input.intent.mimeType) {
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
  const principal = await requireAuthenticatedPrincipal(input.client);
  const ownsObject = objectKeyBelongsToUser(input.objectKey, principal.id);
  const canAdministerPrivateFiles = principal.role === 'OWNER' || principal.role === 'ADMIN';

  if (!ownsObject && !canAdministerPrivateFiles) {
    throw new PrivateFileAccessError('OBJECT_NOT_AUTHORIZED');
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
    throw new PrivateFileAccessError(`SIGNED_URL_FAILED:${error?.message ?? 'UNKNOWN'}`);
  }

  return data.signedUrl;
}
