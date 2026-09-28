import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@recruitops/database';
import type { SocialPublisherRegistry } from '@recruitops/queue';
import {
  buildRedisConnectionOptions,
  readWorkerRuntimeConfig,
  startPublicationWorkerRuntime,
  WorkerRuntimeConfigurationError,
} from './runtime.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const config = {
  databaseUrl: 'postgresql://user:password@db.example.com:5432/recruitops',
  redisUrl: 'rediss://worker:secret@redis.example.com:6380/2',
  metaGraphApiVersion: 'v26.0',
  limits: {
    concurrency: 3,
    maxPerDuration: 7,
    durationMs: 2_000,
  },
};

const credentialEnv = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: encryptionKey }),
};

describe('publication worker runtime', () => {
  it('reads validated runtime configuration and bounded positive worker limits', () => {
    expect(
      readWorkerRuntimeConfig({
        DATABASE_URL: config.databaseUrl,
        REDIS_URL: config.redisUrl,
        META_GRAPH_API_VERSION: config.metaGraphApiVersion,
        PUBLICATION_WORKER_CONCURRENCY: '3',
        PUBLICATION_WORKER_RATE_LIMIT_MAX: '7',
        PUBLICATION_WORKER_RATE_LIMIT_DURATION_MS: '2000',
        ...credentialEnv,
      }),
    ).toEqual(config);
  });

  it('fails closed on missing or invalid server connection settings', () => {
    expect(() =>
      readWorkerRuntimeConfig({
        DATABASE_URL: 'https://not-postgres.example.com',
        REDIS_URL: 'redis://localhost:6379',
        META_GRAPH_API_VERSION: 'v26.0',
        ...credentialEnv,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_DATABASE_URL_INVALID',
      }),
    );

    expect(() =>
      readWorkerRuntimeConfig({
        DATABASE_URL: 'postgresql://localhost/recruitops',
        REDIS_URL: 'https://not-redis.example.com',
        META_GRAPH_API_VERSION: 'v26.0',
        ...credentialEnv,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_REDIS_URL_INVALID',
      }),
    );
  });

  it('requires the credential keyring and an explicit Meta Graph API version', () => {
    expect(() =>
      readWorkerRuntimeConfig({
        DATABASE_URL: config.databaseUrl,
        REDIS_URL: config.redisUrl,
        META_GRAPH_API_VERSION: 'v26.0',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_OAUTH_CREDENTIAL_KEYRING_INVALID',
      }),
    );

    expect(() =>
      readWorkerRuntimeConfig({
        DATABASE_URL: config.databaseUrl,
        REDIS_URL: config.redisUrl,
        META_GRAPH_API_VERSION: 'latest',
        ...credentialEnv,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_META_GRAPH_API_VERSION_INVALID',
      }),
    );
  });

  it('maps redis URL credentials, TLS and database selection into BullMQ connection options', () => {
    expect(buildRedisConnectionOptions(config.redisUrl)).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 2,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it('starts the worker with injected dependencies and closes worker/database exactly once', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createDatabase = vi
      .fn()
      .mockReturnValue({ $disconnect: disconnect } as unknown as PrismaClient);
    const createWorker = vi.fn().mockReturnValue({ close });
    const publishers: SocialPublisherRegistry = { get: vi.fn().mockReturnValue(undefined) };
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const runtime = startPublicationWorkerRuntime(config, {
      createDatabase,
      createWorker,
      publishers,
      logger,
    });

    expect(createDatabase).toHaveBeenCalledWith(config.databaseUrl);
    expect(createWorker).toHaveBeenCalledOnce();
    expect(createWorker.mock.calls[0]?.[0]).toMatchObject({
      connection: {
        host: 'redis.example.com',
        port: 6380,
        username: 'worker',
        db: 2,
        maxRetriesPerRequest: null,
      },
      limits: config.limits,
    });
    expect(logger.info).toHaveBeenCalledWith('publication_worker_started', {
      concurrency: 3,
      rateLimitMax: 7,
      rateLimitDurationMs: 2_000,
      enabledPublishers: ['FACEBOOK'],
    });

    await Promise.all([runtime.close(), runtime.close()]);

    expect(close).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('publication_worker_stopped');
  });
});
