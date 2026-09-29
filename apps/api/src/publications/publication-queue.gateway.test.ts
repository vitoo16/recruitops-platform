import { describe, expect, it, vi } from 'vitest';
import { PublicationQueueGateway } from './publication-queue.gateway.js';

const publicationId = '11111111-1111-4111-8111-111111111111';

interface FakeJob {
  getState(): Promise<string>;
  retry?: ReturnType<typeof vi.fn>;
}

function harness(job: FakeJob | null) {
  const queue = {
    getJob: vi.fn().mockResolvedValue(job),
    add: vi.fn().mockResolvedValue({ id: publicationId }),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  const gateway = new PublicationQueueGateway();

  (
    gateway as unknown as {
      queueHandlePromise: Promise<{ queue: typeof queue; close(): Promise<void> }>;
    }
  ).queueHandlePromise = Promise.resolve({ queue, close });

  return { gateway, queue, close };
}

describe('PublicationQueueGateway manual retry', () => {
  it('retries a retained failed BullMQ job with attempts reset', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const job = {
      getState: vi.fn().mockResolvedValue('failed'),
      retry,
    };
    const { gateway, queue } = harness(job);

    await expect(gateway.retryFailed(publicationId)).resolves.toBe('RETRIED');

    expect(queue.getJob).toHaveBeenCalledWith(publicationId);
    expect(retry).toHaveBeenCalledWith('failed', { resetAttemptsMade: true });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-enqueues the same publication identity when retention removed the failed job', async () => {
    const { gateway, queue } = harness(null);

    await expect(gateway.retryFailed(publicationId)).resolves.toBe('REENQUEUED');

    expect(queue.add).toHaveBeenCalledOnce();
    expect(queue.add.mock.calls[0]?.[1]).toMatchObject({
      publicationId,
      idempotencyKey: `publication:${publicationId}`,
    });
    expect(queue.add.mock.calls[0]?.[2]).toMatchObject({ jobId: publicationId });
  });

  it('does not create a duplicate retry when the job is already queued', async () => {
    const retry = vi.fn();
    const job = {
      getState: vi.fn().mockResolvedValue('waiting'),
      retry,
    };
    const { gateway, queue } = harness(job);

    await expect(gateway.retryFailed(publicationId)).resolves.toBe('ALREADY_QUEUED');

    expect(retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('fails closed when queue state is incompatible with a persisted FAILED publication', async () => {
    const job = {
      getState: vi.fn().mockResolvedValue('completed'),
      retry: vi.fn(),
    };
    const { gateway } = harness(job);

    await expect(gateway.retryFailed(publicationId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLICATION_QUEUE_STATE_MISMATCH' }),
    });
  });
});
