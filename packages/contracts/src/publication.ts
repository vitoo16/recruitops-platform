import { z } from 'zod';
import { SocialPlatformSchema } from './content.js';

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

export const PublicationQueueJobSchema = z.object({
  publicationId: z.uuid(),
  platform: SocialPlatformSchema,
});

export type PublicationQueueJob = z.infer<typeof PublicationQueueJobSchema>;

export function buildPublicationIdempotencyKey(publicationId: string): string {
  const parsed = PublicationIdentitySchema.parse({ publicationId });
  return `publication:${parsed.publicationId}`;
}

export function buildPublicationQueueJobId(publicationId: string): string {
  const parsed = PublicationIdentitySchema.parse({ publicationId });
  return `publication-${parsed.publicationId}`;
}

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
