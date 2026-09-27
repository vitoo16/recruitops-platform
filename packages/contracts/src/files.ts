import { z } from 'zod';

export const privateFilePurposeValues = ['CONTENT_MEDIA', 'CANDIDATE_CV'] as const;
export const PrivateFilePurposeSchema = z.enum(privateFilePurposeValues);
export const mediaAssetKindValues = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export const candidateDocumentKindValues = ['CV', 'OTHER'] as const;
export const MediaAssetKindSchema = z.enum(mediaAssetKindValues);
export const CandidateDocumentKindSchema = z.enum(candidateDocumentKindValues);

const storageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => !value.includes('..') && !value.startsWith('/'), 'Invalid storage key');
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const fileSizeSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const PrivateFileUploadIntentSchema = z.object({
  purpose: PrivateFilePurposeSchema,
  ownerUserId: z.uuid(),
  ownerEntityId: z.uuid(),
  objectId: z.uuid(),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: fileSizeSchema,
  sha256: sha256Schema.optional(),
});

export const RegisterMediaAssetSchema = z.object({
  postId: z.uuid(),
  kind: MediaAssetKindSchema,
  storageKey: storageKeySchema,
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: fileSizeSchema,
  checksumSha256: sha256Schema.optional(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
  durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  altText: z.string().trim().max(500).optional(),
});

export const MediaAssetSchema = z.object({
  id: z.uuid(),
  postId: z.uuid(),
  kind: MediaAssetKindSchema,
  storageKey: storageKeySchema,
  originalFileName: z.string(),
  mimeType: z.string(),
  sizeBytes: fileSizeSchema,
  checksumSha256: sha256Schema.nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  altText: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const RegisterCandidateDocumentSchema = z.object({
  candidateId: z.uuid(),
  applicationId: z.uuid().optional(),
  kind: CandidateDocumentKindSchema.default('CV'),
  storageKey: storageKeySchema,
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: fileSizeSchema,
  checksumSha256: sha256Schema.optional(),
});

export const CandidateDocumentSchema = z.object({
  id: z.uuid(),
  candidateId: z.uuid(),
  applicationId: z.uuid().nullable(),
  kind: CandidateDocumentKindSchema,
  storageKey: storageKeySchema,
  originalFileName: z.string(),
  mimeType: z.string(),
  sizeBytes: fileSizeSchema,
  checksumSha256: sha256Schema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type PrivateFilePurpose = z.infer<typeof PrivateFilePurposeSchema>;
export type PrivateFileUploadIntent = z.infer<typeof PrivateFileUploadIntentSchema>;
export type RegisterMediaAssetInput = z.infer<typeof RegisterMediaAssetSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type RegisterCandidateDocumentInput = z.infer<typeof RegisterCandidateDocumentSchema>;
export type CandidateDocument = z.infer<typeof CandidateDocumentSchema>;

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

export function objectKeyBelongsToEntity(
  objectKey: string,
  userId: string,
  namespace: 'media' | 'candidates',
  entityId: string,
): boolean {
  const segments = objectKey.split('/');
  return (
    segments.length === 4 &&
    segments[0] === userId &&
    segments[1] === namespace &&
    segments[2] === entityId &&
    Boolean(segments[3])
  );
}
