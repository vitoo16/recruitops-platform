import {
  calculateRetryDelayMs,
  defaultPublicationRetryPolicy,
  shouldRetryPublication,
  type PublicationState,
  type PublishCommand,
  type PublishResult,
  type RetryPolicy,
  type SocialPlatform,
  type SocialPostPayload,
  type SocialPublisher,
  type ValidationIssue,
  type ValidationResult,
} from '@recruitops/contracts';
import type { PublicationQueueJob } from './publication-queue.js';

export interface PublicationExecutionSnapshot {
  publicationId: string;
  state: PublicationState;
  platform: SocialPlatform;
  socialAccountId: string;
  destinationId: string;
  idempotencyKey: string;
  retryCount: number;
  payload: SocialPostPayload;
}

export interface PublicationFailureDetails {
  retryCount: number;
  errorCode: string;
  errorMessage: string;
}

export interface PublicationExecutionStore {
  claimForPublishing(
    publicationId: string,
    idempotencyKey: string,
  ): Promise<PublicationExecutionSnapshot | null>;
  markPublished(publicationId: string, result: PublishResult, publishedAt: Date): Promise<void>;
  markProcessing(publicationId: string, result: PublishResult): Promise<void>;
  markRetryWaiting(
    publicationId: string,
    failure: PublicationFailureDetails & { nextRetryAt: Date },
  ): Promise<void>;
  markFailed(publicationId: string, failure: PublicationFailureDetails): Promise<void>;
}

export interface PublicationPublisherResolver {
  resolve(platform: SocialPlatform): Promise<SocialPublisher>;
}

export interface PublicationExecutionErrorClassification {
  code: string;
  message: string;
  retryable: boolean;
}

export interface PublicationExecutionErrorClassifier {
  classify(error: unknown): PublicationExecutionErrorClassification;
}

export interface PublicationExecutionOutcome {
  outcome: 'SKIPPED' | 'PUBLISHED' | 'PROCESSING' | 'RETRY_WAITING' | 'FAILED';
  publicationId: string;
}

export class PublicationRetryScheduledError extends Error {
  constructor(
    public readonly code: string,
    public readonly nextRetryAt: Date,
  ) {
    super(code);
    this.name = 'PublicationRetryScheduledError';
  }
}

function validationFailure(issues: readonly ValidationIssue[]): PublicationExecutionErrorClassification {
  const codes = [...new Set(issues.map((issue) => issue.code))].sort();
  return {
    code: 'PUBLICATION_VALIDATION_FAILED',
    message: codes.length ? `Validation failed: ${codes.join(',')}` : 'Publication validation failed',
    retryable: false,
  };
}

function buildCommand(snapshot: PublicationExecutionSnapshot): PublishCommand {
  return {
    platform: snapshot.platform,
    socialAccountId: snapshot.socialAccountId,
    destinationId: snapshot.destinationId,
    idempotencyKey: snapshot.idempotencyKey,
    payload: snapshot.payload,
  };
}

export function createPublicationExecutionHandler(input: {
  store: PublicationExecutionStore;
  publishers: PublicationPublisherResolver;
  errors: PublicationExecutionErrorClassifier;
  retryPolicy?: Readonly<RetryPolicy>;
  now?: () => Date;
}) {
  const retryPolicy = input.retryPolicy ?? defaultPublicationRetryPolicy;
  const now = input.now ?? (() => new Date());

  async function handleExecutionFailure(
    snapshot: PublicationExecutionSnapshot,
    error: unknown,
  ): Promise<PublicationExecutionOutcome> {
    const failure = input.errors.classify(error);
    const retryCount = snapshot.retryCount + 1;

    if (shouldRetryPublication(retryCount, failure.retryable, retryPolicy)) {
      const delayMs = calculateRetryDelayMs(retryCount, retryPolicy);
      const nextRetryAt = new Date(now().getTime() + delayMs);
      await input.store.markRetryWaiting(snapshot.publicationId, {
        retryCount,
        nextRetryAt,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      throw new PublicationRetryScheduledError(failure.code, nextRetryAt);
    }

    await input.store.markFailed(snapshot.publicationId, {
      retryCount,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
    return { outcome: 'FAILED', publicationId: snapshot.publicationId };
  }

  return async function execute(job: PublicationQueueJob): Promise<PublicationExecutionOutcome> {
    const snapshot = await input.store.claimForPublishing(job.publicationId, job.idempotencyKey);
    if (!snapshot) {
      return { outcome: 'SKIPPED', publicationId: job.publicationId };
    }

    if (
      snapshot.publicationId !== job.publicationId ||
      snapshot.idempotencyKey !== job.idempotencyKey
    ) {
      throw new Error('PUBLICATION_EXECUTION_CLAIM_INTEGRITY_MISMATCH');
    }

    let publisher: SocialPublisher;
    try {
      publisher = await input.publishers.resolve(snapshot.platform);
    } catch (error) {
      return handleExecutionFailure(snapshot, error);
    }

    if (publisher.platform !== snapshot.platform) {
      return handleExecutionFailure(snapshot, new Error('PUBLICATION_PUBLISHER_PLATFORM_MISMATCH'));
    }

    const command = buildCommand(snapshot);
    let validation: ValidationResult;
    try {
      validation = await publisher.validate(command);
    } catch (error) {
      return handleExecutionFailure(snapshot, error);
    }

    if (!validation.valid) {
      const failure = validationFailure(validation.issues);
      const retryCount = snapshot.retryCount + 1;
      await input.store.markFailed(snapshot.publicationId, {
        retryCount,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      return { outcome: 'FAILED', publicationId: snapshot.publicationId };
    }

    let result: PublishResult;
    try {
      result = await publisher.publish(command);
    } catch (error) {
      return handleExecutionFailure(snapshot, error);
    }

    if (result.status === 'PUBLISHED') {
      await input.store.markPublished(snapshot.publicationId, result, now());
      return { outcome: 'PUBLISHED', publicationId: snapshot.publicationId };
    }

    await input.store.markProcessing(snapshot.publicationId, result);
    return { outcome: 'PROCESSING', publicationId: snapshot.publicationId };
  };
}
