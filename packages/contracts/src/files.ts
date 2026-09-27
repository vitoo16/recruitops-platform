import { z } from 'zod';

export const privateFilePurposeValues = ['CONTENT_MEDIA', 'CANDIDATE_CV'] as const;
export const PrivateFilePurposeSchema = z.enum(privateFilePurposeValues);

export const PrivateFileUploadIntentSchema = z.object({
  purpose: PrivateFilePurposeSchema,
  ownerUserId: z.uuid(),
  ownerEntityId: z.uuid(),
  objectId: z.uuid(),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export type PrivateFilePurpose = z.infer<typeof PrivateFilePurposeSchema>;
export type PrivateFileUploadIntent = z.infer<typeof PrivateFileUploadIntentSchema>;

export interface PrivateFileUploadPolicy {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
}

export interface PrivateFilePolicyResult {
  valid: boolean;
  issues: readonly string[];
}

const mimeExtensions: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function validatePrivateFileUpload(
  intent: PrivateFileUploadIntent,
  policy: PrivateFileUploadPolicy,
): PrivateFilePolicyResult {
  const issues: string[] = [];

  if (!policy.allowedMimeTypes.includes(intent.mimeType)) {
    issues.push('MIME_TYPE_NOT_ALLOWED');
  }

  if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes <= 0) {
    issues.push('INVALID_UPLOAD_POLICY');
  } else if (intent.sizeBytes > policy.maxBytes) {
    issues.push('FILE_TOO_LARGE');
  }

  return { valid: issues.length === 0, issues };
}

export function extensionForMimeType(mimeType: string): string {
  return mimeExtensions[mimeType.toLowerCase()] ?? 'bin';
}

export function buildPrivateObjectKey(intent: PrivateFileUploadIntent): string {
  const parsed = PrivateFileUploadIntentSchema.parse(intent);
  const namespace = parsed.purpose === 'CONTENT_MEDIA' ? 'media' : 'candidates';
  const extension = extensionForMimeType(parsed.mimeType);

  return `${parsed.ownerUserId}/${namespace}/${parsed.ownerEntityId}/${parsed.objectId}.${extension}`;
}

export function objectKeyBelongsToUser(objectKey: string, userId: string): boolean {
  return objectKey.startsWith(`${userId}/`);
}
