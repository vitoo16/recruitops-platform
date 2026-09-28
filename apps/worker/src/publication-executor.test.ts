import { describe, expect, it, vi } from 'vitest';
import type { PublishCommand, SocialPublisher } from '@recruitops/contracts';
import {
  PublicationExecutor,
  RetryablePublicationExecutionError,
  type PublicationExecutionContext,
  type PublicationExecutionRepository,
} from './publication-executor.js';

const publicationId = '33333333-3333-4333-8333-333333333333';

function context(
  overrides: Partial<PublicationExecutionContext> = {},
): PublicationExecutionContext {
  return {
    publicationId,
    attemptNumber: 1,
    platform: 'FACEBOOK',
    destinationPlatform: 'FACEBOOK',
    destinationId: '22222222-2222-4222-8222-222222222222',
    destinationExternalId: '123456789',
    destinationEnabled: true,
    postingMode: 'API',
    socialAccountId: '11111111-1111-4111-8111-111111111111',
    socialAccountPlatform: 'FACEBOOK',
    socialAccountStatus: 'CONNECTED',
    idempotencyKey: `publication:${publicationId}`,
    text: 'We are hiring',
    hashtags: ['jobs'],
    link: 'https://example.com/jobs/1',
    metadata: {},
    media: [],
    ...overrides,
  };
}

function repository(claimed: PublicationExecutionContext | null) {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    markPublished: vi.fn().mockResolvedValue(undefined),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    markRetryWaiting: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  } satisfies PublicationExecutionRepository;
}

function publisher(publish: SocialPublisher['publish']): SocialPublisher {
  return {
    platform: 'FACEBOOK',
    validate: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    publish,
    getStatus: vi.fn().mockResolvedValue({ status: 'UNKNOWN' }),
  };
}

describe('PublicationExecutor', () => {
  it('claims and persists a published result with the canonical command', async () => {
    const repo = repository(context());
    let received: PublishCommand | undefined;
    const socialPublisher = publisher(async (command) => {
      received = command;
      return { status: 'PUBLISHED', externalPostId: 'provider-post-1' };
    });
    const executor = new PublicationExecutor(repo, {
      create: vi.fn().mockReturnValue(socialPublisher),
    });

    await expect(executor.execute(publicationId, 1)).resolves.toEqual({
      status: 'PUBLISHED',
      result: { status: 'PUBLISHED', externalPostId: 'provider-post-1' },
    });

    expect(repo.claim).toHaveBeenCalledWith(publicationId, 1);
    expect(received).toEqual({
      platform: 'FACEBOOK',
      socialAccountId: '11111111-1111-4111-8111-111111111111',
      destinationId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: `publication:${publicationId}`,
      payload: {
        text: 'We are hiring',
        hashtags: ['jobs'],
        link: 'https://example.com/jobs/1',
        mediaIds: [],
        metadata: {},
      },
    });
    expect(repo.markPublished).toHaveBeenCalledWith(publicationId, {
      status: 'PUBLISHED',
      externalPostId: 'provider-post-1',
    });
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('persists processing provider results without marking them published', async () => {
    const repo = repository(context({ platform: 'INSTAGRAM', destinationPlatform: 'INSTAGRAM' }));
    const executor = new PublicationExecutor(repo, {
      create: vi.fn().mockReturnValue(
        publisher(async () => ({
          status: 'PROCESSING',
          externalPostId: 'container-1',
          providerRequestId: 'request-1',
        })),
      ),
    });

    await expect(executor.execute(publicationId, 1)).resolves.toMatchObject({
      status: 'PROCESSING',
    });
    expect(repo.markProcessing).toHaveBeenCalledOnce();
    expect(repo.markPublished).not.toHaveBeenCalled();
  });

  it('marks retry waiting and rethrows a safe retry signal for retryable failures', async () => {
    const repo = repository(context({ attemptNumber: 2 }));
    const networkError = Object.assign(new Error('provider connection failed'), {
      code: 'META_FACEBOOK_PAGE_PUBLISH_NETWORK_ERROR',
    });
    const executor = new PublicationExecutor(repo, {
      create: vi.fn().mockReturnValue(
        publisher(async () => {
          throw networkError;
        }),
      ),
    });

    await expect(executor.execute(publicationId, 2)).rejects.toBeInstanceOf(
      RetryablePublicationExecutionError,
    );
    expect(repo.markRetryWaiting).toHaveBeenCalledOnce();
    expect(repo.markRetryWaiting.mock.calls[0]?.[1]).toEqual({
      code: 'META_FACEBOOK_PAGE_PUBLISH_NETWORK_ERROR',
      retryable: true,
      status: undefined,
    });
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('persists terminal provider failures without retrying the BullMQ job', async () => {
    const repo = repository(context());
    const badRequest = Object.assign(new Error('provider rejected request'), {
      code: 'META_FACEBOOK_PAGE_PUBLISH_FAILED_PROVIDER_100',
      status: 400,
    });
    const executor = new PublicationExecutor(repo, {
      create: vi.fn().mockReturnValue(
        publisher(async () => {
          throw badRequest;
        }),
      ),
    });

    await expect(executor.execute(publicationId, 1)).resolves.toEqual({
      status: 'FAILED',
      failure: {
        code: 'META_FACEBOOK_PAGE_PUBLISH_FAILED_PROVIDER_100',
        retryable: false,
        status: 400,
      },
    });
    expect(repo.markFailed).toHaveBeenCalledOnce();
    expect(repo.markRetryWaiting).not.toHaveBeenCalled();
  });

  it('skips duplicate delivery of the same queue attempt when claim returns null', async () => {
    const repo = repository(null);
    const create = vi.fn();
    const executor = new PublicationExecutor(repo, { create });

    await expect(executor.execute(publicationId, 1)).resolves.toEqual({ status: 'SKIPPED' });
    expect(repo.claim).toHaveBeenCalledWith(publicationId, 1);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid BullMQ attempt numbers before touching persistence', async () => {
    const repo = repository(context());
    const executor = new PublicationExecutor(repo, { create: vi.fn() });

    await expect(executor.execute(publicationId, 0)).rejects.toThrow(RangeError);
    expect(repo.claim).not.toHaveBeenCalled();
  });
});
