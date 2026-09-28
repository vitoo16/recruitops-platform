import {
  buildPublicationIdempotencyKey,
  calculateRetryDelayMs,
  defaultPublicationRetryPolicy,
  type PublicationStatus,
  type PublishCommand,
  type PublishResult,
  type SocialPlatform,
  type SocialPublisher,
} from '@recruitops/contracts';
import type { EncryptedOAuthCredential } from '@recruitops/integrations';

export interface PublicationMediaContext {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  storageKey: string;
}

export interface PublicationExecutionContext {
  publicationId: string;
  attemptNumber: number;
  platform: SocialPlatform;
  destinationPlatform: SocialPlatform;
  destinationId: string;
  destinationExternalId?: string | undefined;
  destinationEnabled: boolean;
  postingMode: 'API' | 'MANUAL';
  socialAccountId?: string | undefined;
  socialAccountPlatform?: SocialPlatform | undefined;
  socialAccountStatus?: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR' | undefined;
  idempotencyKey: string;
  text: string;
  hashtags: readonly string[];
  link?: string | undefined;
  metadata: Readonly<Record<string, unknown>>;
  media: readonly PublicationMediaContext[];
  credential?: EncryptedOAuthCredential | undefined;
}

export interface PublicationExecutionRepository {
  claim(publicationId: string): Promise<PublicationExecutionContext | null>;
  markPublished(publicationId: string, result: PublishResult): Promise<void>;
  markProcessing(publicationId: string, result: PublishResult): Promise<void>;
  markRetryWaiting(
    publicationId: string,
    failure: PublicationExecutionFailure,
    nextRetryAt: Date,
  ): Promise<void>;
  markFailed(publicationId: string, failure: PublicationExecutionFailure): Promise<void>;
}

export interface PublicationPublisherFactory {
  create(context: PublicationExecutionContext): Promise<SocialPublisher> | SocialPublisher;
}

export interface PublicationExecutionFailure {
  code: string;
  retryable: boolean;
  status?: number | undefined;
}

export type PublicationExecutionOutcome =
  | { status: 'SKIPPED' }
  | { status: 'PUBLISHED'; result: PublishResult }
  | { status: 'PROCESSING'; result: PublishResult }
  | { status: 'FAILED'; failure: PublicationExecutionFailure };

export class RetryablePublicationExecutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RetryablePublicationExecutionError';
  }
}

function normalizeFailureCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_:-]{1,160}$/.test(code)) return code;
  }
  return 'PUBLICATION_EXECUTION_FAILED';
}

function normalizeFailureStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

export function classifyPublicationFailure(error: unknown): PublicationExecutionFailure {
  const code = normalizeFailureCode(error);
  const status = normalizeFailureStatus(error);
  const retryable =
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    code.includes('NETWORK_ERROR') ||
    code.includes('TIMEOUT') ||
    code.includes('RATE_LIMIT');

  return { code, retryable, status };
}

function buildCommand(context: PublicationExecutionContext): PublishCommand {
  const expectedIdempotencyKey = buildPublicationIdempotencyKey(context.publicationId);
  if (context.idempotencyKey !== expectedIdempotencyKey) {
    const error = new Error('PUBLICATION_IDEMPOTENCY_KEY_MISMATCH') as Error & { code: string };
    error.code = 'PUBLICATION_IDEMPOTENCY_KEY_MISMATCH';
    throw error;
  }
  if (!context.socialAccountId) {
    const error = new Error('PUBLICATION_SOCIAL_ACCOUNT_REQUIRED') as Error & { code: string };
    error.code = 'PUBLICATION_SOCIAL_ACCOUNT_REQUIRED';
    throw error;
  }

  return {
    platform: context.platform,
    socialAccountId: context.socialAccountId,
    destinationId: context.destinationId,
    idempotencyKey: context.idempotencyKey,
    payload: {
      text: context.text,
      hashtags: context.hashtags,
      link: context.link,
      mediaIds: context.media.map((media) => media.id),
      metadata: context.metadata,
    },
  };
}

export class PublicationExecutor {
  constructor(
    private readonly repository: PublicationExecutionRepository,
    private readonly publishers: PublicationPublisherFactory,
  ) {}

  async execute(publicationId: string): Promise<PublicationExecutionOutcome> {
    const context = await this.repository.claim(publicationId);
    if (!context) return { status: 'SKIPPED' };

    try {
      const publisher = await this.publishers.create(context);
      const command = buildCommand(context);
      const result = await publisher.publish(command);

      if (result.status === 'PROCESSING') {
        await this.repository.markProcessing(publicationId, result);
        return { status: 'PROCESSING', result };
      }

      await this.repository.markPublished(publicationId, result);
      return { status: 'PUBLISHED', result };
    } catch (error) {
      const failure = classifyPublicationFailure(error);
      if (failure.retryable && context.attemptNumber < defaultPublicationRetryPolicy.maxAttempts) {
        const nextRetryAt = new Date(
          Date.now() + calculateRetryDelayMs(context.attemptNumber, defaultPublicationRetryPolicy),
        );
        await this.repository.markRetryWaiting(publicationId, failure, nextRetryAt);
        throw new RetryablePublicationExecutionError(failure.code);
      }

      await this.repository.markFailed(publicationId, failure);
      return { status: 'FAILED', failure };
    }
  }
}

export function isTerminalPublicationStatus(status: PublicationStatus['status']): boolean {
  return status === 'PUBLISHED' || status === 'FAILED';
}
