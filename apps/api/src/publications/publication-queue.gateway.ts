import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createPublicationQueue, enqueuePublication } from '@recruitops/queue';

interface PublicationQueueHandle {
  queue: Awaited<ReturnType<typeof createPublicationQueue>>['queue'];
  close(): Promise<void>;
}

@Injectable()
export class PublicationQueueGateway implements OnModuleDestroy {
  private queueHandlePromise: Promise<PublicationQueueHandle> | undefined;

  async enqueue(publicationId: string, scheduledAt: Date): Promise<void> {
    const handle = await this.getQueueHandle();
    await enqueuePublication(handle.queue, { publicationId, scheduledAt });
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
