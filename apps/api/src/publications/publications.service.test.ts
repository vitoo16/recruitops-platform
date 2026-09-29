import { describe, expect, it, vi } from 'vitest';
import type { PublicationQueueGateway } from './publication-queue.gateway.js';
import type { PublicationsRepository } from './publications.repository.js';
import { PublicationsService } from './publications.service.js';

const publicationId = '11111111-1111-4111-8111-111111111111';
const postVariantId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const socialAccountId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-09-29T03:00:00.000Z');

function command() {
  return { publicationId, postVariantId, destinationId };
}

function context() {
  return {
    postVariantId,
    postId,
    platform: 'FACEBOOK' as const,
    postStatus: 'READY' as const,
    destination: {
      id: destinationId,
      platform: 'FACEBOOK' as const,
      postingMode: 'API' as const,
      enabled: true,
      socialAccountId,
      socialAccount: {
        id: socialAccountId,
        platform: 'FACEBOOK' as const,
        status: 'CONNECTED' as const,
        expiresAt: new Date('2026-10-29T03:00:00.000Z'),
      },
    },
  };
}

function persisted(state: 'PENDING' | 'PUBLISHED' | 'FAILED' = 'PENDING') {
  return {
    id: publicationId,
    postVariantId,
    destinationId,
    socialAccountId,
    state,
    idempotencyKey: `publication:${publicationId}`,
    scheduledAt: now,
    lastErrorCode: null,
  };
}

function harness() {
  const repository = {
    findReadiness: vi.fn().mockResolvedValue({
      postVariantId,
      postId,
      platform: 'FACEBOOK',
      postStatus: 'READY',
      destinations: [
        {
          id: destinationId,
          platform: 'FACEBOOK',
          type: 'PAGE',
          name: 'RecruitOps Page',
          socialAccountId,
        },
      ],
    }),
    findPublishContext: vi.fn().mockResolvedValue(context()),
    upsertPublication: vi.fn().mockResolvedValue(persisted()),
    recordQueueEnqueueFailure: vi.fn().mockResolvedValue(undefined),
    clearQueueEnqueueFailure: vi.fn().mockResolvedValue(undefined),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const service = new PublicationsService(
    repository as unknown as PublicationsRepository,
    queue as unknown as PublicationQueueGateway,
  );
  return { service, repository, queue };
}

describe('PublicationsService', () => {
  it('returns only structurally eligible API destinations for a READY post', async () => {
    const { service } = harness();

    await expect(service.getPublishNowReadiness(postVariantId, now)).resolves.toEqual({
      postVariantId,
      postId,
      platform: 'FACEBOOK',
      postStatus: 'READY',
      canPublish: true,
      blockingReasons: [],
      destinations: [
        {
          id: destinationId,
          platform: 'FACEBOOK',
          type: 'PAGE',
          name: 'RecruitOps Page',
          socialAccountId,
        },
      ],
    });
  });

  it('reports readiness blockers without inventing a destination', async () => {
    const { service, repository } = harness();
    repository.findReadiness.mockResolvedValueOnce({
      postVariantId,
      postId,
      platform: 'FACEBOOK',
      postStatus: 'DRAFT',
      destinations: [],
    });

    const result = await service.getPublishNowReadiness(postVariantId, now);

    expect(result.canPublish).toBe(false);
    expect(result.blockingReasons).toEqual(['POST_NOT_READY', 'NO_ELIGIBLE_API_DESTINATION']);
  });

  it('persists and enqueues a publish-now command with the same publication UUID', async () => {
    const { service, repository, queue } = harness();

    await expect(service.publishNow(command(), now)).resolves.toEqual({
      acceptance: 'QUEUED',
      publication: {
        id: publicationId,
        postVariantId,
        destinationId,
        socialAccountId,
        state: 'PENDING',
        scheduledAt: now.toISOString(),
      },
    });

    expect(repository.upsertPublication).toHaveBeenCalledWith(command(), socialAccountId, now);
    expect(queue.enqueue).toHaveBeenCalledWith(publicationId, now);
    expect(repository.clearQueueEnqueueFailure).toHaveBeenCalledWith(publicationId);
  });

  it('returns an existing accepted publication without enqueuing a provider retry', async () => {
    const { service, repository, queue } = harness();
    repository.upsertPublication.mockResolvedValueOnce(persisted('PUBLISHED'));

    const result = await service.publishNow(command(), now);

    expect(result.acceptance).toBe('ALREADY_ACCEPTED');
    expect(result.publication.state).toBe('PUBLISHED');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('records ambiguous queue acceptance while preserving the retryable publication identity', async () => {
    const { service, repository, queue } = harness();
    queue.enqueue.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.publishNow(command(), now)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLICATION_QUEUE_ENQUEUE_UNCONFIRMED' }),
    });
    expect(repository.recordQueueEnqueueFailure).toHaveBeenCalledWith(publicationId);
  });

  it('rejects an expired social account before persisting or enqueuing', async () => {
    const { service, repository, queue } = harness();
    repository.findPublishContext.mockResolvedValueOnce({
      ...context(),
      destination: {
        ...context().destination,
        socialAccount: {
          ...context().destination.socialAccount!,
          expiresAt: new Date('2026-09-29T02:59:59.000Z'),
        },
      },
    });

    await expect(service.publishNow(command(), now)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLICATION_SOCIAL_ACCOUNT_NOT_CONNECTED' }),
    });
    expect(repository.upsertPublication).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects manual destinations from the API Publish Now command', async () => {
    const { service, repository, queue } = harness();
    repository.findPublishContext.mockResolvedValueOnce({
      ...context(),
      destination: { ...context().destination, postingMode: 'MANUAL' },
    });

    await expect(service.publishNow(command(), now)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLICATION_DESTINATION_NOT_API' }),
    });
    expect(repository.upsertPublication).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
