import type { PublishCommand, SocialPublisher } from '@recruitops/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PublicationQueueJob } from './publication-queue.js';
import {
  PublicationRetryScheduledError,
  createPublicationExecutionHandler,
  type PublicationExecutionErrorClassifier,
  type PublicationExecutionSnapshot,
  type PublicationExecutionStore,
  type PublicationPublisherResolver,
} from './publication-execution.js';

const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const socialAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const destinationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const job: PublicationQueueJob = {
  publicationId,
  idempotencyKey: `publication:${publicationId}`,
  scheduledAt: '2026-09-28T01:00:00.000Z',
};

function snapshot(
  overrides: Partial<PublicationExecutionSnapshot> = {},
): PublicationExecutionSnapshot {
  return {
    publicationId,
    state: 'PUBLISHING',
    platform: 'FACEBOOK',
    socialAccountId,
    destinationId,
    idempotencyKey: job.idempotencyKey,
    retryCount: 0,
    payload: {
      text: 'We are hiring',
      hashtags: ['jobs'],
    },
    ...overrides,
  };
}

function createStore(claim: PublicationExecutionSnapshot | null = snapshot()) {
  return {
    claimForPublishing: vi.fn().mockResolvedValue(claim),
    markPublished: vi.fn().mockResolvedValue(undefined),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    markRetryWaiting: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  } satisfies PublicationExecutionStore;
}

function createPublisher() {
  return {
    platform: 'FACEBOOK' as const,
    validate: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    publish: vi.fn().mockResolvedValue({
      status: 'PUBLISHED' as const,
      externalPostId: '123_456',
    }),
    getStatus: vi.fn(),
  } satisfies SocialPublisher;
}

function createResolver(publisher: SocialPublisher) {
  return {
    resolve: vi.fn().mockResolvedValue(publisher),
  } satisfies PublicationPublisherResolver;
}

function createClassifier(retryable = true) {
  return {
    classify: vi.fn().mockReturnValue({
      code: 'PROVIDER_TEMPORARY',
      message: 'Provider request failed',
      retryable,
    }),
  } satisfies PublicationExecutionErrorClassifier;
}

function expectCommand(input: unknown): asserts input is PublishCommand {
  expect(input).toMatchObject({
    platform: 'FACEBOOK',
    socialAccountId,
    destinationId,
    idempotencyKey: job.idempotencyKey,
    payload: { text: 'We are hiring', hashtags: ['jobs'] },
  });
}

describe('publication execution handler', () => {
  it('skips a job that the store cannot claim without calling a provider', async () => {
    const store = createStore(null);
    const publisher = createPublisher();
    const resolver = createResolver(publisher);
    const execute = createPublicationExecutionHandler({
      store,
      publishers: resolver,
      errors: createClassifier(),
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'SKIPPED', publicationId });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes a claimed job and persists normalized provider identifiers', async () => {
    const store = createStore();
    const publisher = createPublisher();
    const now = new Date('2026-09-28T01:02:03.000Z');
    const execute = createPublicationExecutionHandler({
      store,
      publishers: createResolver(publisher),
      errors: createClassifier(),
      now: () => now,
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'PUBLISHED', publicationId });
    expectCommand(publisher.validate.mock.calls[0]?.[0]);
    expectCommand(publisher.publish.mock.calls[0]?.[0]);
    expect(store.markPublished).toHaveBeenCalledWith(
      publicationId,
      { status: 'PUBLISHED', externalPostId: '123_456' },
      now,
    );
    expect(store.markRetryWaiting).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('persists provider processing state without treating it as published', async () => {
    const store = createStore(snapshot({ platform: 'INSTAGRAM' }));
    const publisher = {
      ...createPublisher(),
      platform: 'INSTAGRAM' as const,
      publish: vi.fn().mockResolvedValue({
        status: 'PROCESSING' as const,
        providerRequestId: 'container-123',
      }),
    } satisfies SocialPublisher;
    const execute = createPublicationExecutionHandler({
      store,
      publishers: createResolver(publisher),
      errors: createClassifier(),
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'PROCESSING', publicationId });
    expect(store.markProcessing).toHaveBeenCalledWith(publicationId, {
      status: 'PROCESSING',
      providerRequestId: 'container-123',
    });
    expect(store.markPublished).not.toHaveBeenCalled();
  });

  it('fails terminally on validation issues and stores only normalized issue codes', async () => {
    const store = createStore();
    const publisher = createPublisher();
    publisher.validate.mockResolvedValue({
      valid: false,
      issues: [
        { code: 'B_FIELD', message: 'provider-facing detail', field: 'payload' },
        { code: 'A_FIELD', message: 'another detail' },
        { code: 'B_FIELD', message: 'duplicate' },
      ],
    });
    const execute = createPublicationExecutionHandler({
      store,
      publishers: createResolver(publisher),
      errors: createClassifier(),
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'FAILED', publicationId });
    expect(store.markFailed).toHaveBeenCalledWith(publicationId, {
      retryCount: 1,
      errorCode: 'PUBLICATION_VALIDATION_FAILED',
      errorMessage: 'Validation failed: A_FIELD,B_FIELD',
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('marks retry waiting with deterministic backoff and throws only a normalized retry error', async () => {
    const store = createStore(snapshot({ retryCount: 1 }));
    const publisher = createPublisher();
    publisher.publish.mockRejectedValue(new Error('raw provider secret detail'));
    const classifier = createClassifier(true);
    const now = new Date('2026-09-28T01:00:00.000Z');
    const execute = createPublicationExecutionHandler({
      store,
      publishers: createResolver(publisher),
      errors: classifier,
      retryPolicy: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 10_000 },
      now: () => now,
    });

    const promise = execute(job);
    await expect(promise).rejects.toMatchObject<Partial<PublicationRetryScheduledError>>({
      code: 'PROVIDER_TEMPORARY',
      nextRetryAt: new Date('2026-09-28T01:00:02.000Z'),
    });
    expect(store.markRetryWaiting).toHaveBeenCalledWith(publicationId, {
      retryCount: 2,
      nextRetryAt: new Date('2026-09-28T01:00:02.000Z'),
      errorCode: 'PROVIDER_TEMPORARY',
      errorMessage: 'Provider request failed',
    });
    await promise.catch((error: unknown) => {
      expect(String(error)).not.toContain('raw provider secret detail');
    });
  });

  it('marks a non-retryable provider failure terminal without rethrowing it', async () => {
    const store = createStore();
    const publisher = createPublisher();
    publisher.publish.mockRejectedValue(new Error('provider denied'));
    const execute = createPublicationExecutionHandler({
      store,
      publishers: createResolver(publisher),
      errors: createClassifier(false),
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'FAILED', publicationId });
    expect(store.markFailed).toHaveBeenCalledWith(publicationId, {
      retryCount: 1,
      errorCode: 'PROVIDER_TEMPORARY',
      errorMessage: 'Provider request failed',
    });
  });

  it('normalizes resolver failures so a claimed publication does not stay stuck in publishing', async () => {
    const store = createStore();
    const resolver = {
      resolve: vi.fn().mockRejectedValue(new Error('credential resolver secret detail')),
    } satisfies PublicationPublisherResolver;
    const execute = createPublicationExecutionHandler({
      store,
      publishers: resolver,
      errors: createClassifier(false),
    });

    await expect(execute(job)).resolves.toEqual({ outcome: 'FAILED', publicationId });
    expect(store.markFailed).toHaveBeenCalledWith(publicationId, {
      retryCount: 1,
      errorCode: 'PROVIDER_TEMPORARY',
      errorMessage: 'Provider request failed',
    });
  });

  it('refuses an inconsistent claimed record before resolving a provider', async () => {
    const store = createStore(snapshot({ idempotencyKey: 'publication:other' }));
    const publisher = createPublisher();
    const resolver = createResolver(publisher);
    const execute = createPublicationExecutionHandler({
      store,
      publishers: resolver,
      errors: createClassifier(),
    });

    await expect(execute(job)).rejects.toThrow('PUBLICATION_EXECUTION_CLAIM_INTEGRITY_MISMATCH');
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });
});
