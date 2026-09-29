import { Queue, createNodeRedisClient, type JobsOptions } from 'bullmq';
import { createClient } from 'redis';
import {
  PublicationIdentitySchema,
  buildPublicationIdempotencyKey,
  defaultPublicationRetryPolicy,
} from '@recruitops/contracts';

export const PUBLICATION_QUEUE_NAME = 'publication-dispatch';
export const PUBLICATION_JOB_NAME = 'dispatch-publication';

export interface PublicationQueueJob {
  publicationId: string;
  idempotencyKey: string;
  scheduledAt: string;
  correlationId?: string | undefined;
}

export interface SchedulePublicationInput {
  publicationId: string;
  scheduledAt: Date;
  correlationId?: string | undefined;
}

export interface PublicationQueueLike {
  add(
    name: typeof PUBLICATION_JOB_NAME,
    data: PublicationQueueJob,
    options: JobsOptions,
  ): Promise<unknown>;
}

function normalizeCorrelationId(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const value = input.trim();
  if (!value || value.length > 128) throw new RangeError('correlationId must be 1-128 characters');
  return value;
}

export function buildPublicationQueueJob(input: SchedulePublicationInput): PublicationQueueJob {
  const { publicationId } = PublicationIdentitySchema.parse({ publicationId: input.publicationId });
  if (Number.isNaN(input.scheduledAt.getTime())) {
    throw new RangeError('scheduledAt must be a valid Date');
  }

  const correlationId = normalizeCorrelationId(input.correlationId);
  return {
    publicationId,
    idempotencyKey: buildPublicationIdempotencyKey(publicationId),
    scheduledAt: input.scheduledAt.toISOString(),
    ...(correlationId ? { correlationId } : {}),
  };
}

export function buildPublicationJobOptions(
  input: SchedulePublicationInput,
  nowMs = Date.now(),
): JobsOptions {
  const delay = Math.max(0, input.scheduledAt.getTime() - nowMs);

  return {
    jobId: input.publicationId,
    delay,
    attempts: defaultPublicationRetryPolicy.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: defaultPublicationRetryPolicy.baseDelayMs,
    },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
  };
}

export async function enqueuePublication(
  queue: PublicationQueueLike,
  input: SchedulePublicationInput,
  nowMs = Date.now(),
): Promise<void> {
  const data = buildPublicationQueueJob(input);
  const options = buildPublicationJobOptions(input, nowMs);
  await queue.add(PUBLICATION_JOB_NAME, data, options);
}

export async function createPublicationQueue(redisUrl: string) {
  if (!redisUrl.trim()) throw new Error('REDIS_URL_REQUIRED');

  const rawClient = createClient({ url: redisUrl });
  rawClient.on('error', (error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'recruitops-queue',
        event: 'redis_error',
        message: error instanceof Error ? error.message : 'unknown redis error',
      }),
    );
  });
  await rawClient.connect();

  const connection = createNodeRedisClient(rawClient);
  const queue = new Queue<PublicationQueueJob>(PUBLICATION_QUEUE_NAME, {
    connection,
    prefix: 'recruitops',
  });

  return {
    queue,
    async close() {
      await queue.close();
      if (rawClient.isOpen) await rawClient.quit();
    },
  };
}
