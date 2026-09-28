import { describe, expect, it, vi } from 'vitest';
import type { SocialPublisherRegistry } from '@recruitops/queue';
import { createPublicationJobHandler } from './publication-handler.js';
import type { PrismaPublicationExecutionRepository } from './publication-execution.repository.js';

function repositoryMock() {
  return {
    loadForExecution: vi.fn().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      state: 'PUBLISHED',
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
      payload: { text: 'Already published', hashtags: [] },
    }),
    compareAndSet: vi.fn(),
  } as unknown as PrismaPublicationExecutionRepository;
}

describe('createPublicationJobHandler', () => {
  it('forwards validated queue identity to the publication executor and ignores scheduling metadata', async () => {
    const repository = repositoryMock();
    const publishers = { get: vi.fn() } satisfies SocialPublisherRegistry;
    const handler = createPublicationJobHandler(repository, publishers);

    await expect(
      handler({
        publicationId: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
        scheduledAt: '2026-09-28T12:00:00.000Z',
      }),
    ).resolves.toBeUndefined();

    expect(repository.loadForExecution).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(publishers.get).not.toHaveBeenCalled();
  });
});
