import { z } from 'zod';
import { PostStatusSchema, SocialPlatformSchema } from './content.js';
import { DestinationTypeSchema } from './social.js';

export const publicationStateValues = [
  'PENDING',
  'SCHEDULED',
  'PUBLISHING',
  'PROCESSING',
  'PUBLISHED',
  'RETRY_WAITING',
  'FAILED',
  'CANCELLED',
] as const;

export const PublicationStateSchema = z.enum(publicationStateValues);

export type PublicationState = z.infer<typeof PublicationStateSchema>;

const publicationTransitions: Readonly<Record<PublicationState, readonly PublicationState[]>> = {
  PENDING: ['SCHEDULED', 'PUBLISHING', 'CANCELLED'],
  SCHEDULED: ['PUBLISHING', 'CANCELLED'],
  PUBLISHING: ['PROCESSING', 'PUBLISHED', 'RETRY_WAITING', 'FAILED'],
  PROCESSING: ['PUBLISHED', 'RETRY_WAITING', 'FAILED'],
  PUBLISHED: [],
  RETRY_WAITING: ['PUBLISHING', 'CANCELLED'],
  FAILED: ['PUBLISHING', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionPublicationState(
  from: PublicationState,
  to: PublicationState,
): boolean {
  return from === to || publicationTransitions[from].includes(to);
}

export const PublicationIdentitySchema = z.object({
  publicationId: z.uuid(),
});

export function buildPublicationIdempotencyKey(publicationId: string): string {
  const parsed = PublicationIdentitySchema.parse({ publicationId });
  return `publication:${parsed.publicationId}`;
}

export const PublishNowCommandSchema = z
  .object({
    publicationId: z.uuid(),
    postVariantId: z.uuid(),
    destinationId: z.uuid(),
  })
  .strict();

export const PublishNowBlockingReasonSchema = z.enum([
  'POST_NOT_READY',
  'NO_ELIGIBLE_API_DESTINATION',
]);

export const PublishNowDestinationSchema = z
  .object({
    id: z.uuid(),
    platform: SocialPlatformSchema,
    type: DestinationTypeSchema,
    name: z.string().trim().min(1).max(160),
    socialAccountId: z.uuid(),
  })
  .strict();

export const PublishNowReadinessSchema = z
  .object({
    postVariantId: z.uuid(),
    postId: z.uuid(),
    platform: SocialPlatformSchema,
    postStatus: PostStatusSchema,
    canPublish: z.boolean(),
    blockingReasons: z.array(PublishNowBlockingReasonSchema),
    destinations: z.array(PublishNowDestinationSchema),
  })
  .strict();

export const PublishNowAcceptanceSchema = z.enum(['QUEUED', 'ALREADY_ACCEPTED']);

export const PublishNowPublicationSchema = z
  .object({
    id: z.uuid(),
    postVariantId: z.uuid(),
    destinationId: z.uuid(),
    socialAccountId: z.uuid(),
    state: PublicationStateSchema,
    scheduledAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const PublishNowResponseSchema = z
  .object({
    acceptance: PublishNowAcceptanceSchema,
    publication: PublishNowPublicationSchema,
  })
  .strict();

export const PublicationRetryBlockReasonSchema = z.enum(['MANUAL_REVIEW_REQUIRED']);

export const PublicationStatusDestinationSchema = z
  .object({
    id: z.uuid(),
    platform: SocialPlatformSchema,
    type: DestinationTypeSchema,
    name: z.string().trim().min(1).max(160),
  })
  .strict();

export const PublicationStatusRecordSchema = z
  .object({
    id: z.uuid(),
    postVariantId: z.uuid(),
    socialAccountId: z.uuid().nullable(),
    state: PublicationStateSchema,
    destination: PublicationStatusDestinationSchema,
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    nextRetryAt: z.iso.datetime({ offset: true }).nullable(),
    retryCount: z.number().int().nonnegative(),
    lastErrorCode: z.string().trim().min(1).max(160).nullable(),
    lastErrorMessage: z.string().trim().min(1).max(1_000).nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    canRetry: z.boolean(),
    retryBlockReason: PublicationRetryBlockReasonSchema.nullable(),
  })
  .strict();

export const PublicationStatusListSchema = z
  .object({
    items: z.array(PublicationStatusRecordSchema),
    truncated: z.boolean(),
  })
  .strict();

export const PublicationManualRetryAcceptanceSchema = z.enum([
  'RETRIED',
  'REENQUEUED',
  'ALREADY_QUEUED',
]);

export const PublicationManualRetryResponseSchema = z
  .object({
    acceptance: PublicationManualRetryAcceptanceSchema,
    publication: PublicationStatusRecordSchema,
  })
  .strict();

export type PublishNowCommand = z.infer<typeof PublishNowCommandSchema>;
export type PublishNowBlockingReason = z.infer<typeof PublishNowBlockingReasonSchema>;
export type PublishNowDestination = z.infer<typeof PublishNowDestinationSchema>;
export type PublishNowReadiness = z.infer<typeof PublishNowReadinessSchema>;
export type PublishNowAcceptance = z.infer<typeof PublishNowAcceptanceSchema>;
export type PublishNowResponse = z.infer<typeof PublishNowResponseSchema>;
export type PublicationRetryBlockReason = z.infer<typeof PublicationRetryBlockReasonSchema>;
export type PublicationStatusRecord = z.infer<typeof PublicationStatusRecordSchema>;
export type PublicationStatusList = z.infer<typeof PublicationStatusListSchema>;
export type PublicationManualRetryAcceptance = z.infer<
  typeof PublicationManualRetryAcceptanceSchema
>;
export type PublicationManualRetryResponse = z.infer<typeof PublicationManualRetryResponseSchema>;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const defaultPublicationRetryPolicy: Readonly<RetryPolicy> = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 15 * 60 * 1_000,
};

export function calculateRetryDelayMs(
  attempt: number,
  policy: Readonly<RetryPolicy> = defaultPublicationRetryPolicy,
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError('attempt must be a positive integer');
  }
  if (!Number.isInteger(policy.baseDelayMs) || policy.baseDelayMs < 1) {
    throw new RangeError('baseDelayMs must be a positive integer');
  }
  if (!Number.isInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs) {
    throw new RangeError('maxDelayMs must be an integer greater than or equal to baseDelayMs');
  }

  const exponent = Math.min(attempt - 1, 30);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
}

export function shouldRetryPublication(
  attempt: number,
  retryable: boolean,
  policy: Readonly<RetryPolicy> = defaultPublicationRetryPolicy,
): boolean {
  if (!Number.isInteger(attempt) || attempt < 1) return false;
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) return false;
  return retryable && attempt < policy.maxAttempts;
}
