import { describe, expect, it, vi } from 'vitest';
import {
  PUBLICATION_JOB_NAME,
  PublicationScheduler,
  buildPublicationJobOptions,
  parseRedisConnection,
  publicationQueueName,
  resolvePublicationWorkerConfig,
  type PublicationQueueFactory,
} from './index.js';

const publicationId = '550e8400-e29b-41d4-a716-446655440001';

describe('publication queue primitives', () => {
  it('uses isolated per-platform queues', () => {
    expect(publicationQueueName('FACEBOOK')).toBe('recruitops-publications-facebook');
    expect(publicationQueueName('TIKTOK')).toBe('recruitops-publications-tiktok');
  });

  it('parses secure Redis URLs without logging or exposing them', () => {
    expect(parseRedisConnection('rediss://user:p%40ss@redis.example.com:6380/2')).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      tls: {},
    });
  });

  it('builds bounded-retry jobs with BullMQ-safe deterministic IDs', () => {
    const options = buildPublicationJobOptions(publicationId, 5_000);
    expect(options.jobId).toBe(`publication-${publicationId}`);
    expect(options.jobId).not.toContain(':');
    expect(options.delay).toBe(5_000);
    expect(options.attempts).toBe(5);
    expect(options.backoff).toEqual({ type: 'exponential', delay: 1_000 });
  });

  it('schedules through an injected queue without requiring Redis in unit tests', async () => {
    const add = vi.fn().mockResolvedValue({ id: `publication-${publicationId}` });
    const close = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn(() => ({ add, close })) as unknown as PublicationQueueFactory;
    const scheduler = new PublicationScheduler({
      redisUrl: 'redis://localhost:6379',
      queueFactory: factory,
      now: () => Date.parse('2026-09-27T10:00:00.000Z'),
    });

    await expect(
      scheduler.schedule({
        publicationId,
        platform: 'LINKEDIN',
        runAt: new Date('2026-09-27T10:05:00.000Z'),
      }),
    ).resolves.toEqual({
      queueName: 'recruitops-publications-linkedin',
      jobId: `publication-${publicationId}`,
      delayMs: 300_000,
    });

    expect(add).toHaveBeenCalledWith(
      PUBLICATION_JOB_NAME,
      { publicationId, platform: 'LINKEDIN' },
      expect.objectContaining({
        jobId: `publication-${publicationId}`,
        delay: 300_000,
      }),
    );
    await scheduler.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('applies conservative internal worker limits and validates overrides', () => {
    expect(resolvePublicationWorkerConfig()).toEqual({
      concurrency: 4,
      limiter: { max: 1, duration: 1_000 },
    });
    expect(
      resolvePublicationWorkerConfig({
        concurrency: 2,
        limiter: { max: 10, duration: 5_000 },
      }),
    ).toEqual({
      concurrency: 2,
      limiter: { max: 10, duration: 5_000 },
    });
    expect(() => resolvePublicationWorkerConfig({ concurrency: 0 })).toThrow();
  });
});
