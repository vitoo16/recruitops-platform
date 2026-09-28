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
  it('loads explicit ordered variant media without credential or storage material', async () => {
    const { database, findUnique } = createDatabase();
    findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      state: 'SCHEDULED',
      retryCount: 0,
      idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
      postVariant: {
        platform: 'INSTAGRAM',
        text: 'We are hiring',
        hashtags: ['jobs'],
        link: 'https://example.com/jobs/1',
        metadata: { locale: 'vi' },
        mediaSelections: [
          { mediaAssetId: '44444444-4444-4444-8444-444444444444' },
          { mediaAssetId: '55555555-5555-4555-8555-555555555555' },
        ],
      },
      destination: {
        id: '22222222-2222-4222-8222-222222222222',
        platform: 'INSTAGRAM',
        postingMode: 'API',
        enabled: true,
        socialAccountId: '11111111-1111-4111-8111-111111111111',
      },
      socialAccount: {
        id: '11111111-1111-4111-8111-111111111111',
        platform: 'INSTAGRAM',
        status: 'CONNECTED',
      },
    });

    const repository = new PrismaPublicationExecutionRepository(database);
    const result = await repository.loadForExecution('33333333-3333-4333-8333-333333333333');

    expect(result?.payload).toEqual({
      text: 'We are hiring',
      hashtags: ['jobs'],
      link: 'https://example.com/jobs/1',
      mediaIds: [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
      metadata: { locale: 'vi' },
    });
    const query = findUnique.mock.calls[0]?.[0];
    const queryText = JSON.stringify(query);
    expect(queryText).toContain('mediaSelections');
    expect(queryText).toContain('mediaAssetId');
    expect(queryText).not.toContain('credential');
    expect(queryText).not.toContain('storageKey');
  });

  it('does not infer media when the variant has no explicit selection', async () => {
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
        metadata: {},
        mediaSelections: [],
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
    expect(result?.payload).toEqual({ text: 'We are hiring', hashtags: [], metadata: {} });
  });

  it('returns null when the publication does not exist', async () => {
    const { database, findUnique } = createDatabase();
    findUnique.mockResolvedValue(null);
    const repository = new PrismaPublicationExecutionRepository(database);

    await expect(
      repository.loadForExecution('33333333-3333-4333-8333-333333333333'),
    ).resolves.toBeNull();
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
