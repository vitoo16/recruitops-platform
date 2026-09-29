import { describe, expect, it, vi } from 'vitest';
import type { PublicationQueueGateway } from './publication-queue.gateway.js';
import type { PublicationsRepository } from './publications.repository.js';
import { PublicationsService } from './publications.service.js';

const publicationId = '11111111-1111-4111-8111-111111111111';
const postVariantId = '22222222-2222-4222-8222-222222222222';
const destinationId = '44444444-4444-4444-8444-444444444444';
const socialAccountId = '55555555-5555-4555-8555-555555555555';
const correlationId = 'request-123';
const now = new Date('2026-09-30T01:00:00.000Z');

function command() {
  return { publicationId, postVariantId, destinationId };
}

function publishContext() {
  return {
    postVariantId,
    postId: '33333333-3333-4333-8333-333333333333',
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
        expiresAt: null,
      },
    },
  };
}

function statusRow() {
  return {
    id: publicationId,
    postVariantId,
    socialAccountId,
    state: 'FAILED' as const,
    scheduledAt: now,
    publishedAt: null,
    nextRetryAt: null,
    retryCount: 5,
    correlationId,
    lastErrorCode: 'PROVIDER_TEMPORARY_ERROR',
    lastErrorMessage: 'Provider operation failed: PROVIDER_TEMPORARY_ERROR',
    updatedAt: new Date('2026-09-30T01:05:00.000Z'),
    destination: {
      id: destinationId,
      platform: 'FACEBOOK' as const,
      type: 'PAGE' as const,
      name: 'RecruitOps Page',
    },
  };
}

describe('publication correlation propagation', () => {
  it('persists the API request id and forwards the persisted value to BullMQ', async () => {
    const repository = {
      findPublishContext: vi.fn().mockResolvedValue(publishContext()),
      upsertPublication: vi.fn().mockResolvedValue({
        id: publicationId,
        postVariantId,
        destinationId,
        socialAccountId,
        state: 'PENDING',
        idempotencyKey: `publication:${publicationId}`,
        scheduledAt: now,
        correlationId,
        lastErrorCode: null,
      }),
      clearQueueEnqueueFailure: vi.fn().mockResolvedValue(undefined),
      recordQueueEnqueueFailure: vi.fn().mockResolvedValue(undefined),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const service = new PublicationsService(
      repository as unknown as PublicationsRepository,
      queue as unknown as PublicationQueueGateway,
    );

    await service.publishNow(command(), now, correlationId);

    expect(repository.upsertPublication).toHaveBeenCalledWith(
      command(),
      socialAccountId,
      now,
      correlationId,
    );
    expect(queue.enqueue).toHaveBeenCalledWith(publicationId, now, correlationId);
  });

  it('reuses the persisted publication correlation id when recreating a missing failed job', async () => {
    const row = statusRow();
    const repository = {
      findStatusById: vi
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce({ ...row, retryCount: 0 }),
      prepareManualRetry: vi.fn().mockResolvedValue(true),
    };
    const queue = { retryFailed: vi.fn().mockResolvedValue('REENQUEUED') };
    const service = new PublicationsService(
      repository as unknown as PublicationsRepository,
      queue as unknown as PublicationQueueGateway,
    );

    await service.retryPublication(publicationId);

    expect(queue.retryFailed).toHaveBeenCalledWith(publicationId, correlationId);
  });
});
