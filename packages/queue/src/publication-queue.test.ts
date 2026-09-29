import { describe, expect, it, vi } from 'vitest';
import {
  PUBLICATION_JOB_NAME,
  buildPublicationJobOptions,
  buildPublicationQueueJob,
  enqueuePublication,
  type PublicationQueueLike,
} from './publication-queue.js';

const publicationId = '550e8400-e29b-41d4-a716-446655440001';

describe('publication queue scheduling', () => {
  it('builds an idempotent delayed job from a publication id', () => {
    const scheduledAt = new Date('2026-09-27T16:00:00.000Z');
    expect(buildPublicationQueueJob({ publicationId, scheduledAt })).toEqual({
      publicationId,
      idempotencyKey: `publication:${publicationId}`,
      scheduledAt: scheduledAt.toISOString(),
    });

    expect(
      buildPublicationJobOptions(
        { publicationId, scheduledAt },
        new Date('2026-09-27T15:59:00.000Z').getTime(),
      ),
    ).toMatchObject({
      jobId: publicationId,
      delay: 60_000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
    });
  });

  it('carries a bounded correlation id in the queue payload', () => {
    const scheduledAt = new Date('2026-09-27T16:00:00.000Z');

    expect(
      buildPublicationQueueJob({ publicationId, scheduledAt, correlationId: ' request-123 ' }),
    ).toMatchObject({
      publicationId,
      correlationId: 'request-123',
    });

    expect(() =>
      buildPublicationQueueJob({ publicationId, scheduledAt, correlationId: ' '.repeat(3) }),
    ).toThrow('correlationId must be 1-128 characters');
  });

  it('never creates a negative delay for publish-now scheduling', () => {
    const scheduledAt = new Date('2026-09-27T15:00:00.000Z');
    expect(
      buildPublicationJobOptions(
        { publicationId, scheduledAt },
        new Date('2026-09-27T16:00:00.000Z').getTime(),
      ).delay,
    ).toBe(0);
  });

  it('uses the publication id as the BullMQ job id to suppress duplicate enqueues', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as PublicationQueueLike;
    const scheduledAt = new Date('2026-09-27T16:00:00.000Z');

    await enqueuePublication(
      queue,
      { publicationId, scheduledAt, correlationId: 'request-123' },
      scheduledAt.getTime(),
    );

    expect(add).toHaveBeenCalledWith(
      PUBLICATION_JOB_NAME,
      expect.objectContaining({ publicationId, correlationId: 'request-123' }),
      expect.objectContaining({ jobId: publicationId, delay: 0 }),
    );
  });
});
