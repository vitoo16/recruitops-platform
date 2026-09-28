import { describe, expect, it, vi } from 'vitest';
import type { ContentRepository } from './content.repository.js';
import { ContentService } from './content.service.js';

const jobId = '550e8400-e29b-41d4-a716-446655440001';
const postId = '550e8400-e29b-41d4-a716-446655440002';
const variantId = '550e8400-e29b-41d4-a716-446655440003';
const mediaId = '550e8400-e29b-41d4-a716-446655440004';

describe('ContentService', () => {
  it('validates and creates a draft post', async () => {
    const post = {
      id: postId,
      jobId,
      title: 'Backend Engineer',
      baseContent: 'We are hiring.',
      language: 'en' as const,
      status: 'DRAFT' as const,
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    };
    const repository = {
      create: vi.fn().mockResolvedValue(post),
    } as unknown as ContentRepository;
    const service = new ContentService(repository);

    await expect(
      service.createPost({
        jobId,
        title: ' Backend Engineer ',
        baseContent: ' We are hiring. ',
        language: 'en',
      }),
    ).resolves.toEqual(post);

    expect(repository.create).toHaveBeenCalledWith({
      jobId,
      title: 'Backend Engineer',
      baseContent: 'We are hiring.',
      language: 'en',
      status: 'DRAFT',
    });
  });

  it('validates platform variant input before repository access', async () => {
    const variant = {
      id: variantId,
      postId,
      platform: 'INSTAGRAM' as const,
      text: 'Hiring now',
      hashtags: ['hiring'],
      metadata: {},
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
    };
    const repository = {
      upsertVariant: vi.fn().mockResolvedValue(variant),
    } as unknown as ContentRepository;
    const service = new ContentService(repository);

    await expect(
      service.upsertPostVariant(postId, 'INSTAGRAM', {
        text: ' Hiring now ',
        hashtags: ['hiring'],
      }),
    ).resolves.toEqual(variant);
    expect(repository.upsertVariant).toHaveBeenCalledWith(postId, 'INSTAGRAM', {
      text: 'Hiring now',
      hashtags: ['hiring'],
      metadata: {},
    });
  });

  it('rejects duplicate media selections before repository access', () => {
    const repository = {
      replaceVariantMediaSelection: vi.fn(),
    } as unknown as ContentRepository;
    const service = new ContentService(repository);

    expect(() =>
      service.replaceVariantMediaSelection(variantId, { mediaAssetIds: [mediaId, mediaId] }),
    ).toThrow();
    expect(repository.replaceVariantMediaSelection).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination before repository access', () => {
    const repository = { list: vi.fn() } as unknown as ContentRepository;
    const service = new ContentService(repository);

    expect(() => service.listPosts({ page: '0' })).toThrow();
    expect(repository.list).not.toHaveBeenCalled();
  });
});
