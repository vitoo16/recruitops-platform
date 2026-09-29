import { describe, expect, it, vi } from 'vitest';
import type { SocialPublisher } from '@recruitops/contracts';
import {
  executePublication,
  PublicationRetryableError,
  type PublicationExecutionPatch,
  type PublicationExecutionRecord,
  type PublicationExecutionRepository,
} from './publication-executor.js';

const baseRecord: PublicationExecutionRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  state: 'SCHEDULED',
  retryCount: 0,
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  platform: 'FACEBOOK',
  destination: {
    id: '22222222-2222-4222-8222-222222222222',
    platform: 'FACEBOOK',
    postingMode: 'API',
    enabled: true,
    socialAccountId: '11111111-1111-4111-8111-111111111111',
  },
  socialAccount: {
    id: '11111111-1111-4111-8111-111111111111',
    platform: 'FACEBOOK',
    status: 'CONNECTED',
  },
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs'],
  },
};

function createRepository(record: PublicationExecutionRecord = baseRecord) {
  let current = structuredClone(record);
  const patches: PublicationExecutionPatch[] = [];
  const repository: PublicationExecutionRepository = {
    loadForExecution: vi.fn().mockImplementation(async () => structuredClone(current)),
    compareAndSet: vi.fn().mockImplementation(async (_id, expectedStates, patch) => {
      if (!expectedStates.includes(current.state)) return false;
      current = {
        ...current,
        state: patch.state,
        retryCount: patch.retryCount ?? current.retryCount,
      };
      patches.push(patch);
      return true;
    }),
  };
  return { repository, patches, current: () => current };
}

function createPublisher(overrides: Partial<SocialPublisher> = {}): SocialPublisher {
  return {
    platform: 'FACEBOOK',
    validate: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    publish: vi.fn().mockResolvedValue({ status: 'PUBLISHED', externalPostId: 'fb-post-1' }),
    getStatus: vi.fn().mockResolvedValue({ status: 'UNKNOWN' }),
    ...overrides,
  };
}

function registry(publisher?: SocialPublisher) {
  return {
    get: vi.fn().mockReturnValue(publisher),
  };
}

const job = {
  publicationId: baseRecord.id,
  idempotencyKey: baseRecord.idempotencyKey,
  correlationId: 'request-123',
};

describe('executePublication', () => {
  it('claims a scheduled publication and persists a published provider result', async () => {
    const { repository, patches } = createRepository();
    const publisher = createPublisher();
    const now = new Date('2026-09-28T12:00:00.000Z');

    await expect(executePublication(job, repository, registry(publisher), now)).resolves.toEqual({
      status: 'PUBLISHED',
      externalPostId: 'fb-post-1',
    });

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'FACEBOOK',
        idempotencyKey: baseRecord.idempotencyKey,
        correlationId: 'request-123',
      }),
    );
    expect(patches[0]).toMatchObject({ state: 'PUBLISHING' });
    expect(patches[1]).toMatchObject({
      state: 'PUBLISHED',
      externalPostId: 'fb-post-1',
      publishedAt: now,
    });
  });

  it('treats already published jobs as idempotent no-ops', async () => {
    const { repository } = createRepository({ ...baseRecord, state: 'PUBLISHED' });
    const publisher = createPublisher();

    await expect(executePublication(job, repository, registry(publisher))).resolves.toEqual({
      status: 'NOOP',
      reason: 'PUBLICATION_ALREADY_PUBLISHED',
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('fails closed on ambiguous redelivery while state is PUBLISHING', async () => {
    const { repository, patches } = createRepository({ ...baseRecord, state: 'PUBLISHING' });
    const publisher = createPublisher();

    await expect(executePublication(job, repository, registry(publisher))).resolves.toEqual({
      status: 'FAILED',
      code: 'PUBLICATION_AMBIGUOUS_OUTCOME',
    });
    expect(patches.at(-1)).toMatchObject({
      state: 'FAILED',
      lastErrorCode: 'PUBLICATION_AMBIGUOUS_OUTCOME',
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects disabled destinations before provider side effects', async () => {
    const { repository, patches } = createRepository({
      ...baseRecord,
      destination: { ...baseRecord.destination, enabled: false },
    });
    const publisher = createPublisher();

    await expect(executePublication(job, repository, registry(publisher))).resolves.toEqual({
      status: 'FAILED',
      code: 'PUBLICATION_DESTINATION_DISABLED',
    });
    expect(patches.at(-1)).toMatchObject({ state: 'FAILED' });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('moves retryable provider failures to RETRY_WAITING and rethrows for BullMQ', async () => {
    const { repository, patches } = createRepository();
    const providerError = Object.assign(new Error('temporary provider failure'), {
      code: 'META_PROVIDER_TEMPORARY',
      status: 503,
    });
    const publisher = createPublisher({ publish: vi.fn().mockRejectedValue(providerError) });
    const now = new Date('2026-09-28T12:00:00.000Z');

    await expect(
      executePublication(job, repository, registry(publisher), now),
    ).rejects.toBeInstanceOf(PublicationRetryableError);
    expect(patches.at(-1)).toMatchObject({
      state: 'RETRY_WAITING',
      retryCount: 1,
      lastErrorCode: 'META_PROVIDER_TEMPORARY',
    });
    expect(patches.at(-1)?.nextRetryAt?.toISOString()).toBe('2026-09-28T12:00:01.000Z');
  });

  it('persists terminal provider failures without asking BullMQ to retry', async () => {
    const { repository, patches } = createRepository();
    const providerError = Object.assign(new Error('permission denied'), {
      code: 'META_PERMISSION_DENIED',
      status: 403,
    });
    const publisher = createPublisher({ publish: vi.fn().mockRejectedValue(providerError) });

    await expect(executePublication(job, repository, registry(publisher))).resolves.toEqual({
      status: 'FAILED',
      code: 'META_PERMISSION_DENIED',
    });
    expect(patches.at(-1)).toMatchObject({
      state: 'FAILED',
      retryCount: 1,
      lastErrorCode: 'META_PERMISSION_DENIED',
    });
  });

  it('stops retrying once the configured attempt budget is exhausted', async () => {
    const { repository, patches } = createRepository({
      ...baseRecord,
      state: 'RETRY_WAITING',
      retryCount: 4,
    });
    const providerError = Object.assign(new Error('still unavailable'), {
      code: 'META_PROVIDER_TEMPORARY',
      status: 503,
    });
    const publisher = createPublisher({ publish: vi.fn().mockRejectedValue(providerError) });

    await expect(executePublication(job, repository, registry(publisher))).resolves.toEqual({
      status: 'FAILED',
      code: 'META_PROVIDER_TEMPORARY',
    });
    expect(patches.at(-1)).toMatchObject({ state: 'FAILED', retryCount: 5 });
  });
});
