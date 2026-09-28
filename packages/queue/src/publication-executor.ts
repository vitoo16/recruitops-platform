import {
  calculateRetryDelayMs,
  shouldRetryPublication,
  type PublicationState,
  type PublishCommand,
  type SocialPlatform,
  type SocialPublisher,
} from '@recruitops/contracts';

export interface PublicationExecutionRecord {
  id: string;
  state: PublicationState;
  retryCount: number;
  idempotencyKey: string;
  destination: {
    id: string;
    platform: SocialPlatform;
    postingMode: 'API' | 'MANUAL';
    enabled: boolean;
    socialAccountId?: string | undefined;
  };
  socialAccount?:
    | {
        id: string;
        platform: SocialPlatform;
        status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
      }
    | undefined;
  payload: PublishCommand['payload'];
  platform: SocialPlatform;
}

export interface PublicationExecutionPatch {
  state: PublicationState;
  retryCount?: number | undefined;
  nextRetryAt?: Date | null | undefined;
  publishedAt?: Date | null | undefined;
  externalPostId?: string | null | undefined;
  externalUrl?: string | null | undefined;
  providerRequestId?: string | null | undefined;
  lastErrorCode?: string | null | undefined;
  lastErrorMessage?: string | null | undefined;
}

export interface PublicationExecutionRepository {
  loadForExecution(publicationId: string): Promise<PublicationExecutionRecord | null>;
  compareAndSet(
    publicationId: string,
    expectedStates: readonly PublicationState[],
    patch: PublicationExecutionPatch,
  ): Promise<boolean>;
}

export interface SocialPublisherRegistry {
  get(platform: SocialPlatform): SocialPublisher | undefined;
}

export interface PublicationExecutionJob {
  publicationId: string;
  idempotencyKey: string;
}

export type PublicationExecutionOutcome =
  | { status: 'NOOP'; reason: string }
  | { status: 'PUBLISHED'; externalPostId?: string | undefined }
  | { status: 'PROCESSING'; externalPostId?: string | undefined }
  | { status: 'FAILED'; code: string };

export class PublicationRetryableError extends Error {
  constructor(
    public readonly code: string,
    public readonly causeError?: unknown,
  ) {
    super(code);
    this.name = 'PublicationRetryableError';
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code.trim().slice(0, 160);
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 160);
  return 'PUBLICATION_PROVIDER_ERROR';
}

function safeErrorMessage(error: unknown): string {
  const code = errorCode(error);
  return code === 'PUBLICATION_PROVIDER_ERROR' ? code : `Provider operation failed: ${code}`;
}

function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && (status === 429 || status >= 500);
}

function validateExecutionRecord(record: PublicationExecutionRecord): string | null {
  if (!record.destination.enabled) return 'PUBLICATION_DESTINATION_DISABLED';
  if (record.destination.postingMode !== 'API') return 'PUBLICATION_DESTINATION_NOT_API';
  if (!record.destination.socialAccountId || !record.socialAccount) {
    return 'PUBLICATION_SOCIAL_ACCOUNT_REQUIRED';
  }
  if (record.destination.socialAccountId !== record.socialAccount.id) {
    return 'PUBLICATION_SOCIAL_ACCOUNT_MISMATCH';
  }
  if (record.socialAccount.status !== 'CONNECTED') {
    return 'PUBLICATION_SOCIAL_ACCOUNT_NOT_CONNECTED';
  }
  if (
    record.platform !== record.destination.platform ||
    record.platform !== record.socialAccount.platform
  ) {
    return 'PUBLICATION_PLATFORM_MISMATCH';
  }
  return null;
}

async function markFailed(
  repository: PublicationExecutionRepository,
  record: PublicationExecutionRecord,
  code: string,
  message = code,
): Promise<PublicationExecutionOutcome> {
  await repository.compareAndSet(record.id, [record.state, 'PUBLISHING'], {
    state: 'FAILED',
    nextRetryAt: null,
    lastErrorCode: code,
    lastErrorMessage: message,
  });
  return { status: 'FAILED', code };
}

export async function executePublication(
  job: PublicationExecutionJob,
  repository: PublicationExecutionRepository,
  publishers: SocialPublisherRegistry,
  now: Date = new Date(),
): Promise<PublicationExecutionOutcome> {
  const record = await repository.loadForExecution(job.publicationId);
  if (!record) return { status: 'FAILED', code: 'PUBLICATION_NOT_FOUND' };

  if (
    record.state === 'PUBLISHED' ||
    record.state === 'CANCELLED' ||
    record.state === 'PROCESSING'
  ) {
    return { status: 'NOOP', reason: `PUBLICATION_ALREADY_${record.state}` };
  }

  if (record.idempotencyKey !== job.idempotencyKey) {
    return markFailed(repository, record, 'PUBLICATION_IDEMPOTENCY_KEY_MISMATCH');
  }

  if (record.state === 'PUBLISHING') {
    return markFailed(
      repository,
      record,
      'PUBLICATION_AMBIGUOUS_OUTCOME',
      'Previous publish attempt ended while provider outcome was unknown; manual review is required before retry.',
    );
  }

  const invalidCode = validateExecutionRecord(record);
  if (invalidCode) return markFailed(repository, record, invalidCode);

  const publisher = publishers.get(record.platform);
  if (!publisher) return markFailed(repository, record, 'PUBLICATION_PUBLISHER_UNAVAILABLE');

  const claimed = await repository.compareAndSet(record.id, [record.state], {
    state: 'PUBLISHING',
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  if (!claimed) return { status: 'NOOP', reason: 'PUBLICATION_ALREADY_CLAIMED' };

  const command: PublishCommand = {
    platform: record.platform,
    socialAccountId: record.socialAccount!.id,
    destinationId: record.destination.id,
    idempotencyKey: record.idempotencyKey,
    payload: record.payload,
  };

  try {
    const validation = await publisher.validate(command);
    if (!validation.valid) {
      const first = validation.issues[0];
      const code = first?.code ?? 'PUBLICATION_VALIDATION_FAILED';
      await repository.compareAndSet(record.id, ['PUBLISHING'], {
        state: 'FAILED',
        nextRetryAt: null,
        lastErrorCode: code,
        lastErrorMessage: first?.message ?? code,
      });
      return { status: 'FAILED', code };
    }

    const result = await publisher.publish(command);
    if (result.status === 'PROCESSING') {
      await repository.compareAndSet(record.id, ['PUBLISHING'], {
        state: 'PROCESSING',
        externalPostId: result.externalPostId ?? null,
        externalUrl: result.externalUrl ?? null,
        providerRequestId: result.providerRequestId ?? null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      return { status: 'PROCESSING', externalPostId: result.externalPostId };
    }

    await repository.compareAndSet(record.id, ['PUBLISHING'], {
      state: 'PUBLISHED',
      publishedAt: now,
      nextRetryAt: null,
      externalPostId: result.externalPostId ?? null,
      externalUrl: result.externalUrl ?? null,
      providerRequestId: result.providerRequestId ?? null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    return { status: 'PUBLISHED', externalPostId: result.externalPostId };
  } catch (error) {
    const attempt = record.retryCount + 1;
    const code = errorCode(error);
    const retryable = shouldRetryPublication(attempt, isRetryableProviderError(error));

    if (retryable) {
      const nextRetryAt = new Date(now.getTime() + calculateRetryDelayMs(attempt));
      await repository.compareAndSet(record.id, ['PUBLISHING'], {
        state: 'RETRY_WAITING',
        retryCount: attempt,
        nextRetryAt,
        lastErrorCode: code,
        lastErrorMessage: safeErrorMessage(error),
      });
      throw new PublicationRetryableError(code, error);
    }

    await repository.compareAndSet(record.id, ['PUBLISHING'], {
      state: 'FAILED',
      retryCount: attempt,
      nextRetryAt: null,
      lastErrorCode: code,
      lastErrorMessage: safeErrorMessage(error),
    });
    return { status: 'FAILED', code };
  }
}
