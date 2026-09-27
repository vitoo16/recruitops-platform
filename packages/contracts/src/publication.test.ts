import { describe, expect, it } from 'vitest';
import {
  buildPublicationIdempotencyKey,
  calculateRetryDelayMs,
  canTransitionPublicationState,
  shouldRetryPublication,
} from './publication.js';

describe('publication domain', () => {
  it('enforces publication lifecycle transitions', () => {
    expect(canTransitionPublicationState('PENDING', 'SCHEDULED')).toBe(true);
    expect(canTransitionPublicationState('SCHEDULED', 'PUBLISHING')).toBe(true);
    expect(canTransitionPublicationState('PUBLISHING', 'RETRY_WAITING')).toBe(true);
    expect(canTransitionPublicationState('RETRY_WAITING', 'PUBLISHING')).toBe(true);
    expect(canTransitionPublicationState('PUBLISHED', 'PUBLISHING')).toBe(false);
    expect(canTransitionPublicationState('CANCELLED', 'PENDING')).toBe(false);
  });

  it('builds a stable idempotency key from the logical publication id', () => {
    const publicationId = '20e06284-2d8b-4f67-a6db-dd399db5c83c';

    expect(buildPublicationIdempotencyKey(publicationId)).toBe(`publication:${publicationId}`);
    expect(buildPublicationIdempotencyKey(publicationId)).toBe(
      buildPublicationIdempotencyKey(publicationId),
    );
  });

  it('uses bounded exponential backoff', () => {
    const policy = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 5_000 };

    expect(calculateRetryDelayMs(1, policy)).toBe(1_000);
    expect(calculateRetryDelayMs(2, policy)).toBe(2_000);
    expect(calculateRetryDelayMs(3, policy)).toBe(4_000);
    expect(calculateRetryDelayMs(4, policy)).toBe(5_000);
  });

  it('stops retrying at the configured terminal attempt or on non-retryable errors', () => {
    const policy = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 8_000 };

    expect(shouldRetryPublication(1, true, policy)).toBe(true);
    expect(shouldRetryPublication(2, true, policy)).toBe(true);
    expect(shouldRetryPublication(3, true, policy)).toBe(false);
    expect(shouldRetryPublication(1, false, policy)).toBe(false);
  });
});
