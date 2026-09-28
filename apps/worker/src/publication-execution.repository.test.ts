import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@recruitops/database';
import { PrismaPublicationExecutionRepository } from './publication-execution.repository.js';

function createDatabase() {
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const database = {
    publication: {
      findUnique,
      updateMany,
    },
  } as unknown as PrismaClient;
  return { database, findUnique, updateMany };
}

describe('PrismaPublicationExecutionRepository', () => {
  it('loads the minimum execution projection without credential material or inferred media', async () => {
    const { database, findUnique } = createDatabase();
    findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      state: 'SCHEDULED',
      retryCount: 0,
      idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
      postVariant: {
        platform: 'FACEBOOK',
        text: 'We are hiring',
        hashtags: ['jobs'],
        link: 'https://example.com/jobs/1',
        metadata: { locale: 'vi' },
      },
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
    });

    const repository = new PrismaPublicationExecutionRepository(database);
    await expect(
      repository.loadForExecution('33333333-3333-4333-8333-333333333333'),
    ).resolves.toEqual({
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
        link: 'https://example.com/jobs/1',
        metadata: { locale: 'vi' },
      },
    });

    const query = findUnique.mock.calls[0]?.[0];
    expect(JSON.stringify(query)).not.toContain('credential');
    expect(JSON.stringify(query)).not.toContain('mediaAssets');
    expect(JSON.stringify(query)).not.toContain('storageKey');
  });

  it('returns null when the publication does not exist', async () => {
    const { database, findUnique } = createDatabase();
    findUnique.mockResolvedValue(null);
    const repository = new PrismaPublicationExecutionRepository(database);

    await expect(
      repository.loadForExecution('33333333-3333-4333-8333-333333333333'),
    ).resolves.toBeNull();
  });

  it('drops non-object metadata instead of trusting arbitrary JSON shapes', async () => {
    const { database, findUnique } = createDatabase();
    findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      state: 'SCHEDULED',
      retryCount: 0,
      idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
      postVariant: {
        platform: 'FACEBOOK',
        text: 'We are hiring',
        hashtags: [],
        link: null,
        metadata: ['unexpected-array'],
      },
      destination: {
        id: '22222222-2222-4222-8222-222222222222',
        platform: 'FACEBOOK',
        postingMode: 'API',
        enabled: true,
        socialAccountId: null,
      },
      socialAccount: null,
    });
    const repository = new PrismaPublicationExecutionRepository(database);

    const result = await repository.loadForExecution('33333333-3333-4333-8333-333333333333');
    expect(result?.payload).toEqual({ text: 'We are hiring', hashtags: [] });
    expect(result?.destination).not.toHaveProperty('socialAccountId');
    expect(result).not.toHaveProperty('socialAccount');
  });

  it('uses one atomic state predicate for compare-and-set updates', async () => {
    const { database, updateMany } = createDatabase();
    updateMany.mockResolvedValue({ count: 1 });
    const repository = new PrismaPublicationExecutionRepository(database);
    const publishedAt = new Date('2026-09-28T12:00:00.000Z');

    await expect(
      repository.compareAndSet('33333333-3333-4333-8333-333333333333', ['PUBLISHING'], {
        state: 'PUBLISHED',
        publishedAt,
        nextRetryAt: null,
        externalPostId: 'provider-post-1',
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: '33333333-3333-4333-8333-333333333333',
        state: { in: ['PUBLISHING'] },
      },
      data: {
        state: 'PUBLISHED',
        nextRetryAt: null,
        publishedAt,
        externalPostId: 'provider-post-1',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });

  it('reports a lost claim when no row matches the expected state', async () => {
    const { database, updateMany } = createDatabase();
    updateMany.mockResolvedValue({ count: 0 });
    const repository = new PrismaPublicationExecutionRepository(database);

    await expect(
      repository.compareAndSet('33333333-3333-4333-8333-333333333333', ['SCHEDULED'], {
        state: 'PUBLISHING',
      }),
    ).resolves.toBe(false);
  });
});
