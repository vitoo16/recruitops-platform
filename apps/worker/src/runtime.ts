import { createPrismaClient, type PrismaClient } from '@recruitops/database';
import { parseOAuthCredentialKeyring } from '@recruitops/integrations';
import {
  createPublicationWorker,
  type PublicationWorkerLimits,
  type SocialPublisherRegistry,
} from '@recruitops/queue';
import { createProductionPublisherRegistry } from './facebook-publishing-runtime.js';
import {
  createSupabaseProviderMediaResolver,
  readSupabaseProviderMediaSignerConfig,
  WorkerProviderMediaResolutionError,
  type SupabaseProviderMediaSignerConfig,
} from './provider-media-url-resolver.js';
import { createProviderTelemetryRegistry } from './provider-telemetry.js';
import { PrismaPublicationExecutionRepository } from './publication-execution.repository.js';
import { createPublicationJobHandler } from './publication-handler.js';
import {
  readPublicationQueueMonitorConfig,
  startPublicationQueueMonitor,
} from './queue-monitor.js';

export type MediaPublishingRuntimeConfig =
  { enabled: false } | { enabled: true; mediaSigner: SupabaseProviderMediaSignerConfig };

export type LinkedInPublishingRuntimeConfig =
  | { enabled: false }
  | { enabled: true; apiVersion: string };

export interface WorkerRuntimeConfig {
  databaseUrl: string;
  redisUrl: string;
  metaGraphApiVersion: string;
  instagramPublishing: MediaPublishingRuntimeConfig;
  threadsPublishing: MediaPublishingRuntimeConfig;
  linkedinPublishing: LinkedInPublishingRuntimeConfig;
  limits: PublicationWorkerLimits;
}

export interface WorkerRuntimeLogger {
  info(event: string, details?: Readonly<Record<string, unknown>>): void;
  error(event: string, details?: Readonly<Record<string, unknown>>): void;
}

interface ClosablePublicationWorker {
  close(): Promise<void>;
}

interface ClosablePublicationQueueMonitor {
  close(): Promise<void>;
}

export interface WorkerRuntimeDependencies {
  createDatabase(connectionString: string): PrismaClient;
  createWorker(input: Parameters<typeof createPublicationWorker>[0]): ClosablePublicationWorker;
  startQueueMonitor(
    input: Parameters<typeof startPublicationQueueMonitor>[0],
  ): ClosablePublicationQueueMonitor;
  publishers: SocialPublisherRegistry;
  logger: WorkerRuntimeLogger;
}

export class WorkerRuntimeConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WorkerRuntimeConfigurationError';
  }
}

const defaultLogger: WorkerRuntimeLogger = {
  info(event, details = {}) {
    console.log(JSON.stringify({ level: 'info', service: 'recruitops-worker', event, ...details }));
  },
  error(event, details = {}) {
    console.error(
      JSON.stringify({ level: 'error', service: 'recruitops-worker', event, ...details }),
    );
  },
};

function requireUrl(value: string | undefined, code: string, protocols: readonly string[]): string {
  const normalized = value?.trim();
  if (!normalized) throw new WorkerRuntimeConfigurationError(code);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new WorkerRuntimeConfigurationError(code);
  }

  if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
    throw new WorkerRuntimeConfigurationError(code);
  }
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, code: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new WorkerRuntimeConfigurationError(code);
  }
  return parsed;
}

function requireGraphApiVersion(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || !/^v\d+\.\d+$/.test(normalized)) {
    throw new WorkerRuntimeConfigurationError('WORKER_META_GRAPH_API_VERSION_INVALID');
  }
  return normalized;
}

function requireLinkedInApiVersion(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || !/^\d{6}$/.test(normalized)) {
    throw new WorkerRuntimeConfigurationError('WORKER_LINKEDIN_API_VERSION_INVALID');
  }
  return normalized;
}

function booleanFlag(value: string | undefined, code: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true' || normalized === '1') return true;
  throw new WorkerRuntimeConfigurationError(code);
}

function readMediaPublishingConfig(
  env: Readonly<Record<string, string | undefined>>,
  input: {
    flagName: 'PUBLISHING_INSTAGRAM_ENABLED' | 'PUBLISHING_THREADS_ENABLED';
    flagErrorCode: string;
    mediaErrorCode: string;
  },
): MediaPublishingRuntimeConfig {
  const enabled = booleanFlag(env[input.flagName], input.flagErrorCode);
  if (!enabled) return { enabled: false };

  try {
    return {
      enabled: true,
      mediaSigner: readSupabaseProviderMediaSignerConfig(env),
    };
  } catch (error) {
    if (error instanceof WorkerProviderMediaResolutionError) {
      throw new WorkerRuntimeConfigurationError(input.mediaErrorCode);
    }
    throw error;
  }
}

function readLinkedInPublishingConfig(
  env: Readonly<Record<string, string | undefined>>,
): LinkedInPublishingRuntimeConfig {
  const enabled = booleanFlag(
    env.PUBLISHING_LINKEDIN_ENABLED,
    'WORKER_LINKEDIN_PUBLISHING_FLAG_INVALID',
  );
  if (!enabled) return { enabled: false };
  return { enabled: true, apiVersion: requireLinkedInApiVersion(env.LINKEDIN_API_VERSION) };
}

export function readWorkerRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WorkerRuntimeConfig {
  try {
    parseOAuthCredentialKeyring(env as NodeJS.ProcessEnv);
  } catch {
    throw new WorkerRuntimeConfigurationError('WORKER_OAUTH_CREDENTIAL_KEYRING_INVALID');
  }

  return {
    databaseUrl: requireUrl(env.DATABASE_URL, 'WORKER_DATABASE_URL_INVALID', [
      'postgresql:',
      'postgres:',
    ]),
    redisUrl: requireUrl(env.REDIS_URL, 'WORKER_REDIS_URL_INVALID', ['redis:', 'rediss:']),
    metaGraphApiVersion: requireGraphApiVersion(env.META_GRAPH_API_VERSION),
    instagramPublishing: readMediaPublishingConfig(env, {
      flagName: 'PUBLISHING_INSTAGRAM_ENABLED',
      flagErrorCode: 'WORKER_INSTAGRAM_PUBLISHING_FLAG_INVALID',
      mediaErrorCode: 'WORKER_INSTAGRAM_MEDIA_SIGNING_CONFIG_INVALID',
    }),
    threadsPublishing: readMediaPublishingConfig(env, {
      flagName: 'PUBLISHING_THREADS_ENABLED',
      flagErrorCode: 'WORKER_THREADS_PUBLISHING_FLAG_INVALID',
      mediaErrorCode: 'WORKER_THREADS_MEDIA_SIGNING_CONFIG_INVALID',
    }),
    linkedinPublishing: readLinkedInPublishingConfig(env),
    limits: {
      concurrency: positiveInteger(
        env.PUBLICATION_WORKER_CONCURRENCY,
        4,
        'WORKER_CONCURRENCY_INVALID',
      ),
      maxPerDuration: positiveInteger(
        env.PUBLICATION_WORKER_RATE_LIMIT_MAX,
        10,
        'WORKER_RATE_LIMIT_MAX_INVALID',
      ),
      durationMs: positiveInteger(
        env.PUBLICATION_WORKER_RATE_LIMIT_DURATION_MS,
        1_000,
        'WORKER_RATE_LIMIT_DURATION_INVALID',
      ),
    },
  };
}

export function buildRedisConnectionOptions(redisUrl: string) {
  const parsed = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new WorkerRuntimeConfigurationError('WORKER_REDIS_URL_INVALID');
  }

  const databasePath = parsed.pathname.replace(/^\//, '');
  let db: number | undefined;
  if (databasePath) {
    const parsedDb = Number(databasePath);
    if (!Number.isInteger(parsedDb) || parsedDb < 0) {
      throw new WorkerRuntimeConfigurationError('WORKER_REDIS_DATABASE_INVALID');
    }
    db = parsedDb;
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

export interface PublicationWorkerRuntime {
  close(): Promise<void>;
}

export function startPublicationWorkerRuntime(
  config: WorkerRuntimeConfig,
  dependencies: Partial<WorkerRuntimeDependencies> = {},
): PublicationWorkerRuntime {
  const logger = dependencies.logger ?? defaultLogger;
  const database = (dependencies.createDatabase ?? createPrismaClient)(config.databaseUrl);
  const repository = new PrismaPublicationExecutionRepository(database);
  const mediaSigner = config.instagramPublishing.enabled
    ? config.instagramPublishing.mediaSigner
    : config.threadsPublishing.enabled
      ? config.threadsPublishing.mediaSigner
      : undefined;
  const providerMediaResolver = mediaSigner
    ? createSupabaseProviderMediaResolver({
        database,
        ...mediaSigner,
      })
    : undefined;
  const publishers =
    dependencies.publishers ??
    createProductionPublisherRegistry({
      database,
      graphApiVersion: config.metaGraphApiVersion,
      env: process.env,
      ...(config.instagramPublishing.enabled && providerMediaResolver
        ? { instagramMediaResolver: providerMediaResolver }
        : {}),
      ...(config.threadsPublishing.enabled && providerMediaResolver
        ? { threadsMediaResolver: providerMediaResolver }
        : {}),
      ...(config.linkedinPublishing.enabled
        ? { linkedinApiVersion: config.linkedinPublishing.apiVersion }
        : {}),
    });
  const instrumentedPublishers = createProviderTelemetryRegistry(publishers, logger);
  const handler = createPublicationJobHandler(repository, instrumentedPublishers);
  const worker = (dependencies.createWorker ?? createPublicationWorker)({
    connection: buildRedisConnectionOptions(config.redisUrl),
    handler,
    limits: config.limits,
  });
  const queueMonitor = (dependencies.startQueueMonitor ?? startPublicationQueueMonitor)({
    redisUrl: config.redisUrl,
    logger,
    config: readPublicationQueueMonitorConfig(process.env),
  });

  const enabledPublishers = ['FACEBOOK'];
  if (config.instagramPublishing.enabled) enabledPublishers.push('INSTAGRAM');
  if (config.threadsPublishing.enabled) enabledPublishers.push('THREADS');
  if (config.linkedinPublishing.enabled) enabledPublishers.push('LINKEDIN');

  logger.info('publication_worker_started', {
    concurrency: config.limits.concurrency,
    rateLimitMax: config.limits.maxPerDuration,
    rateLimitDurationMs: config.limits.durationMs,
    enabledPublishers,
  });

  let closing: Promise<void> | undefined;
  return {
    close() {
      closing ??= (async () => {
        logger.info('publication_worker_stopping');
        await queueMonitor.close();
        await worker.close();
        await database.$disconnect();
        logger.info('publication_worker_stopped');
      })();
      return closing;
    },
  };
}
