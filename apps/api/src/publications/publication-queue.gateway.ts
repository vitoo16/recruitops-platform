import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createPublicationQueue, enqueuePublication } from '@recruitops/queue';
import type { PublicationManualRetryAcceptance } from '@recruitops/contracts';

interface PublicationQueueHandle {
  queue: Awaited<ReturnType<typeof createPublicationQueue>>['queue'];
  close(): Promise<void>;
}

const alreadyQueuedStates = new Set([
  'active',
  'delayed',
  'prioritized',
  'waiting',
  'waiting-children',
]);

@Injectable()
export class PublicationQueueGateway implements OnModuleDestroy {
  private queueHandlePromise: Promise<PublicationQueueHandle> | undefined;

  async enqueue(publicationId: string, scheduledAt: Date): Promise<void> {
    const handle = await this.getQueueHandle();
    await enqueuePublication(handle.queue, { publicationId, scheduledAt });
  }

  async retryFailed(publicationId: string): Promise<PublicationManualRetryAcceptance> {
    const handle = await this.getQueueHandle();
    const job = await handle.queue.getJob(publicationId);

    if (!job) {
      await enqueuePublication(handle.queue, { publicationId, scheduledAt: new Date() });
      return 'REENQUEUED';
    }

    const state = await job.getState();
    if (alreadyQueuedStates.has(state)) return 'ALREADY_QUEUED';
    if (state !== 'failed') {
      throw new ConflictException({
        code: 'PUBLICATION_QUEUE_STATE_MISMATCH',
        message: 'Publication queue state does not permit a failed-job retry',
      });
    }

    try {
      await job.retry('failed', { resetAttemptsMade: true });
      return 'RETRIED';
    } catch {
      const latestState = await job.getState();
      if (alreadyQueuedStates.has(latestState)) return 'ALREADY_QUEUED';
      throw new ServiceUnavailableException({
        code: 'PUBLICATION_QUEUE_RETRY_UNCONFIRMED',
        message: 'Queue retry acceptance could not be confirmed',
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queueHandlePromise) return;
    try {
      const handle = await this.queueHandlePromise;
      await handle.close();
    } finally {
      this.queueHandlePromise = undefined;
    }
  }

  private getQueueHandle(): Promise<PublicationQueueHandle> {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      throw new ServiceUnavailableException({
        code: 'PUBLICATION_QUEUE_NOT_CONFIGURED',
        message: 'Publication dispatch queue is not configured',
      });
    }

    if (!this.queueHandlePromise) {
      this.queueHandlePromise = createPublicationQueue(redisUrl).catch((error) => {
        this.queueHandlePromise = undefined;
        throw error;
      });
    }
    return this.queueHandlePromise;
  }
}
