import {
  Queue,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
} from 'bullmq';
import {
  PublicationQueueJobSchema,
  buildPublicationQueueJobId,
  defaultPublicationRetryPolicy,
  type PublicationQueueJob,
  type SocialPlatform,
} from '@recruitops/contracts';

export const PUBLICATION_JOB_NAME = 'publish-publication';

const platformQueueSlugs: Readonly<Record<SocialPlatform, string>> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  THREADS: 'threads',
  LINKEDIN: 'linkedin',
  TIKTOK: 'tiktok',
  ZALO: 'zalo',
};

export interface PublicationQueueAddResult {
  id?: string | undefined;
}

export interface PublicationQueueWriter {
  add(
    name: string,
    data: PublicationQueueJob,
    options?: JobsOptions,
  ): Promise<PublicationQueueAddResult>;
  close(): Promise<void>;
}

export type PublicationQueueFactory = (
  name: string,
  connection: ConnectionOptions,
) => PublicationQueueWriter;

export interface SchedulePublicationInput {
  publicationId: string;
  platform: SocialPlatform;
  runAt?: Date | undefined;
}

export interface ScheduledPublicationJob {
  queueName: string;
  jobId: string;
  delayMs: number;
}

export interface PublicationRateLimiter {
  max: number;
  duration: number;
}

export interface PublicationWorkerRuntimeConfig {
  concurrency: number;
  limiter: PublicationRateLimiter;
}

export interface PublicationProcessorContext {
  attempt: number;
  jobId?: string | undefined;
}

export type PublicationProcessor = (
  payload: PublicationQueueJob,
  context: PublicationProcessorContext,
) => Promise<void>;

export interface CreatePublicationWorkerInput {
  redisUrl: string;
  platform: SocialPlatform;
  processor: PublicationProcessor;
  concurrency?: number | undefined;
  limiter?: PublicationRateLimiter | undefined;
}

export const DEFAULT_PUBLICATION_WORKER_CONFIG: Readonly<PublicationWorkerRuntimeConfig> = {
  concurrency: 4,
  limiter: {
    max: 1,
    duration: 1_000,
  },
};

const defaultQueueFactory: PublicationQueueFactory = (name, connection) =>
  new Queue<PublicationQueueJob>(name, { connection });

export function publicationQueueName(platform: SocialPlatform): string {
  return `recruitops-publications-${platformQueueSlugs[platform]}`;
}

export function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new TypeError('REDIS_URL must use redis:// or rediss://');
  }
  if (!parsed.hostname) {
    throw new TypeError('REDIS_URL must include a hostname');
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('REDIS_URL contains an invalid port');
  }

  const path = parsed.pathname.replace(/^\//, '');
  let db: number | undefined;
  if (path) {
    db = Number(path);
    if (!Number.isInteger(db) || db < 0) {
      throw new TypeError('REDIS_URL database must be a non-negative integer');
    }
  }

  return {
    host: parsed.hostname,
    port,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function buildPublicationJobOptions(publicationId: string, delayMs: number): JobsOptions {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError('delayMs must be a non-negative finite number');
  }

  return {
    jobId: buildPublicationQueueJobId(publicationId),
    delay: Math.floor(delayMs),
    attempts: defaultPublicationRetryPolicy.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: defaultPublicationRetryPolicy.baseDelayMs,
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60,
      count: 10_000,
    },
    removeOnFail: {
      age: 30 * 24 * 60 * 60,
      count: 50_000,
    },
  };
}

export function resolvePublicationWorkerConfig(input?: {
  concurrency?: number | undefined;
  limiter?: PublicationRateLimiter | undefined;
}): PublicationWorkerRuntimeConfig {
  const concurrency = input?.concurrency ?? DEFAULT_PUBLICATION_WORKER_CONFIG.concurrency;
  const limiter = input?.limiter ?? DEFAULT_PUBLICATION_WORKER_CONFIG.limiter;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('worker concurrency must be a positive integer');
  }
  if (!Number.isInteger(limiter.max) || limiter.max < 1) {
    throw new RangeError('rate limiter max must be a positive integer');
  }
  if (!Number.isInteger(limiter.duration) || limiter.duration < 1) {
    throw new RangeError('rate limiter duration must be a positive integer');
  }

  return {
    concurrency,
    limiter: { max: limiter.max, duration: limiter.duration },
  };
}

export class PublicationScheduler {
  private readonly queues = new Map<string, PublicationQueueWriter>();

  constructor(
    private readonly options: {
      redisUrl: string;
      queueFactory?: PublicationQueueFactory | undefined;
      now?: (() => number) | undefined;
    },
  ) {}

  async schedule(input: SchedulePublicationInput): Promise<ScheduledPublicationJob> {
    const payload = PublicationQueueJobSchema.parse({
      publicationId: input.publicationId,
      platform: input.platform,
    });
    if (input.runAt && Number.isNaN(input.runAt.getTime())) {
      throw new RangeError('runAt must be a valid Date');
    }

    const now = this.options.now?.() ?? Date.now();
    const delayMs = Math.max(0, (input.runAt?.getTime() ?? now) - now);
    const queueName = publicationQueueName(payload.platform);
    const queue = this.getQueue(queueName);
    const options = buildPublicationJobOptions(payload.publicationId, delayMs);
    const job = await queue.add(PUBLICATION_JOB_NAME, payload, options);

    return {
      queueName,
      jobId: job.id ?? buildPublicationQueueJobId(payload.publicationId),
      delayMs: Math.floor(delayMs),
    };
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  private getQueue(name: string): PublicationQueueWriter {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const connection = parseRedisConnection(this.options.redisUrl);
    const queue = (this.options.queueFactory ?? defaultQueueFactory)(name, connection);
    this.queues.set(name, queue);
    return queue;
  }
}

export function createPublicationWorker(
  input: CreatePublicationWorkerInput,
): Worker<PublicationQueueJob, void, string> {
  const runtime = resolvePublicationWorkerConfig(input);
  const connection = {
    ...parseRedisConnection(input.redisUrl),
    maxRetriesPerRequest: null,
  };

  return new Worker<PublicationQueueJob, void, string>(
    publicationQueueName(input.platform),
    async (job) => {
      if (job.name !== PUBLICATION_JOB_NAME) {
        throw new Error(`UNEXPECTED_PUBLICATION_JOB:${job.name}`);
      }
      const payload = PublicationQueueJobSchema.parse(job.data);
      if (payload.platform !== input.platform) {
        throw new Error(
          `PUBLICATION_PLATFORM_MISMATCH:${payload.platform}:${input.platform}`,
        );
      }
      await input.processor(payload, {
        attempt: job.attemptsMade + 1,
        jobId: job.id,
      });
    },
    {
      connection,
      concurrency: runtime.concurrency,
      limiter: runtime.limiter,
    },
  );
}
