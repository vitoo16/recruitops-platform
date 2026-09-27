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

    await enqueuePublication(queue, { publicationId, scheduledAt }, scheduledAt.getTime());

    expect(add).toHaveBeenCalledWith(
      PUBLICATION_JOB_NAME,
      expect.objectContaining({ publicationId }),
      expect.objectContaining({ jobId: publicationId, delay: 0 }),
    );
  });
});
