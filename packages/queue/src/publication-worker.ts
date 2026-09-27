import {
  Worker,
  type ConnectionOptions,
  type Job,
  type WorkerOptions,
} from 'bullmq';
import {
  PublicationIdentitySchema,
  buildPublicationIdempotencyKey,
} from '@recruitops/contracts';
import {
  PUBLICATION_JOB_NAME,
  PUBLICATION_QUEUE_NAME,
  type PublicationQueueJob,
} from './publication-queue.js';

export interface PublicationWorkerLimits {
  concurrency: number;
  maxPerDuration: number;
  durationMs: number;
}

export const defaultPublicationWorkerLimits: Readonly<PublicationWorkerLimits> = {
  concurrency: 4,
  maxPerDuration: 10,
  durationMs: 1_000,
};

export interface PublicationJobHandler {
  (job: PublicationQueueJob): Promise<void>;
}

export function validatePublicationQueueJob(input: unknown): PublicationQueueJob {
  if (!input || typeof input !== 'object') {
    throw new TypeError('publication queue job must be an object');
  }

  const candidate = input as Partial<PublicationQueueJob>;
  const { publicationId } = PublicationIdentitySchema.parse({
    publicationId: candidate.publicationId,
  });
  const expectedIdempotencyKey = buildPublicationIdempotencyKey(publicationId);

  if (candidate.idempotencyKey !== expectedIdempotencyKey) {
    throw new Error('PUBLICATION_IDEMPOTENCY_KEY_MISMATCH');
  }

  if (typeof candidate.scheduledAt !== 'string' || Number.isNaN(Date.parse(candidate.scheduledAt))) {
    throw new Error('PUBLICATION_SCHEDULED_AT_INVALID');
  }

  return {
    publicationId,
    idempotencyKey: expectedIdempotencyKey,
    scheduledAt: new Date(candidate.scheduledAt).toISOString(),
  };
}

export function normalizePublicationWorkerLimits(
  input: Partial<PublicationWorkerLimits> = {},
): PublicationWorkerLimits {
  const limits = {
    ...defaultPublicationWorkerLimits,
    ...input,
  };

  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive integer`);
    }
  }

  return limits;
}

export function buildPublicationWorkerOptions(
  connection: ConnectionOptions,
  input: Partial<PublicationWorkerLimits> = {},
): WorkerOptions {
  const limits = normalizePublicationWorkerLimits(input);

  return {
    connection,
    prefix: 'recruitops',
    concurrency: limits.concurrency,
    limiter: {
      max: limits.maxPerDuration,
      duration: limits.durationMs,
    },
  };
}

export function createPublicationWorker(input: {
  connection: ConnectionOptions;
  handler: PublicationJobHandler;
  limits?: Partial<PublicationWorkerLimits>;
}) {
  const worker = new Worker<PublicationQueueJob>(
    PUBLICATION_QUEUE_NAME,
    async (job: Job<PublicationQueueJob>) => {
      if (job.name !== PUBLICATION_JOB_NAME) {
        throw new Error(`UNSUPPORTED_PUBLICATION_JOB:${job.name}`);
      }

      const data = validatePublicationQueueJob(job.data);
      await input.handler(data);
    },
    buildPublicationWorkerOptions(input.connection, input.limits),
  );

  worker.on('error', (error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'recruitops-worker',
        event: 'publication_worker_error',
        message: error.message,
      }),
    );
  });

  return worker;
}
