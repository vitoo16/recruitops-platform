import { describe, expect, it } from 'vitest';
import {
  buildPublicationJobExecutionContext,
  buildPublicationWorkerOptions,
  normalizePublicationWorkerLimits,
  validatePublicationQueueJob,
} from './publication-worker.js';

const publicationId = '550e8400-e29b-41d4-a716-446655440001';

describe('publication worker boundary', () => {
  it('normalizes bounded concurrency and rate-limit settings', () => {
    expect(
      normalizePublicationWorkerLimits({
        concurrency: 2,
        maxPerDuration: 5,
        durationMs: 2_000,
      }),
    ).toEqual({
      concurrency: 2,
      maxPerDuration: 5,
      durationMs: 2_000,
    });

    expect(() => normalizePublicationWorkerLimits({ concurrency: 0 })).toThrow(RangeError);
  });

  it('translates limits into BullMQ worker options', () => {
    const connection = { host: 'localhost', port: 6379 };
    expect(
      buildPublicationWorkerOptions(connection, {
        concurrency: 3,
        maxPerDuration: 8,
        durationMs: 1_500,
      }),
    ).toMatchObject({
      connection,
      prefix: 'recruitops',
      concurrency: 3,
      limiter: { max: 8, duration: 1_500 },
    });
  });

  it('maps zero-based BullMQ attemptsMade to a one-based execution attempt', () => {
    expect(buildPublicationJobExecutionContext(0)).toEqual({ attemptNumber: 1 });
    expect(buildPublicationJobExecutionContext(2)).toEqual({ attemptNumber: 3 });
    expect(() => buildPublicationJobExecutionContext(-1)).toThrow(RangeError);
    expect(() => buildPublicationJobExecutionContext(1.5)).toThrow(RangeError);
  });

  it('rejects queue payloads whose idempotency key does not match the publication id', () => {
    expect(() =>
      validatePublicationQueueJob({
        publicationId,
        idempotencyKey: 'publication:another-id',
        scheduledAt: '2026-09-27T16:00:00.000Z',
      }),
    ).toThrow('PUBLICATION_IDEMPOTENCY_KEY_MISMATCH');
  });

  it('accepts and normalizes a valid publication queue payload', () => {
    expect(
      validatePublicationQueueJob({
        publicationId,
        idempotencyKey: `publication:${publicationId}`,
        scheduledAt: '2026-09-27T16:00:00+00:00',
      }),
    ).toEqual({
      publicationId,
      idempotencyKey: `publication:${publicationId}`,
      scheduledAt: '2026-09-27T16:00:00.000Z',
    });
  });
});
