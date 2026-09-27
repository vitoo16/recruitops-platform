import { describe, expect, it } from 'vitest';
import {
  buildPublicationIdempotencyKey,
  buildPublicationQueueJobId,
  calculateRetryDelayMs,
  canTransitionPublicationState,
  PublicationQueueJobSchema,
  shouldRetryPublication,
} from './publication.js';

const publicationId = '550e8400-e29b-41d4-a716-446655440001';

describe('publication contracts', () => {
  it('allows only declared lifecycle transitions', () => {
    expect(canTransitionPublicationState('PUBLISHING', 'RETRY_WAITING')).toBe(true);
    expect(canTransitionPublicationState('RETRY_WAITING', 'PUBLISHING')).toBe(true);
    expect(canTransitionPublicationState('PUBLISHED', 'PUBLISHING')).toBe(false);
  });

  it('builds stable database and queue idempotency identifiers', () => {
    expect(buildPublicationIdempotencyKey(publicationId)).toBe(`publication:${publicationId}`);
    expect(buildPublicationQueueJobId(publicationId)).toBe(`publication-${publicationId}`);
    expect(buildPublicationQueueJobId(publicationId)).not.toContain(':');
  });

  it('validates the minimal queue payload', () => {
    expect(
      PublicationQueueJobSchema.parse({ publicationId, platform: 'LINKEDIN' }),
    ).toEqual({ publicationId, platform: 'LINKEDIN' });
    expect(
      PublicationQueueJobSchema.safeParse({ publicationId, platform: 'UNKNOWN' }).success,
    ).toBe(false);
  });

  it('calculates bounded exponential retry delays', () => {
    expect(calculateRetryDelayMs(1)).toBe(1_000);
    expect(calculateRetryDelayMs(2)).toBe(2_000);
    expect(calculateRetryDelayMs(30)).toBe(15 * 60 * 1_000);
  });

  it('stops retrying at the configured attempt limit', () => {
    expect(shouldRetryPublication(1, true)).toBe(true);
    expect(shouldRetryPublication(5, true)).toBe(false);
    expect(shouldRetryPublication(1, false)).toBe(false);
  });
});
