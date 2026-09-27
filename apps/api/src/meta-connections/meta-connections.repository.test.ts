import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { MetaConnectionsRepository } from './meta-connections.repository.js';

function encrypted(platform: 'FACEBOOK' | 'INSTAGRAM') {
  return {
    platform,
    keyId: 'key-1',
    algorithm: 'aes-256-gcm' as const,
    iv: Uint8Array.from([1, 2, 3]),
    authTag: Uint8Array.from([4, 5, 6]),
    ciphertext: Uint8Array.from([7, 8, 9]),
  };
}

describe('MetaConnectionsRepository', () => {
  it('creates a social account, encrypted credential, and API destination atomically', async () => {
    const transaction = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'social-1' }),
        update: vi.fn(),
      },
      socialCredential: {
        create: vi.fn().mockResolvedValue({ id: 'credential-1' }),
        update: vi.fn(),
      },
      destination: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'destination-1' }),
        update: vi.fn(),
      },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      },
    };
    const repository = new MetaConnectionsRepository(database as unknown as DatabaseService);

    await expect(
      repository.promote([
        {
          platform: 'FACEBOOK',
          externalAccountId: '123',
          displayName: 'RecruitOps Page',
          scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
          credential: encrypted('FACEBOOK'),
          destinationType: 'PAGE',
          destinationName: 'RecruitOps Page',
          destinationExternalId: '123',
        },
      ]),
    ).resolves.toEqual([
      {
        socialAccountId: 'social-1',
        destinationId: 'destination-1',
        platform: 'FACEBOOK',
        externalAccountId: '123',
        displayName: 'RecruitOps Page',
      },
    ]);

    expect(transaction.socialCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: 'FACEBOOK',
        keyId: 'key-1',
        algorithm: 'aes-256-gcm',
      }),
    });
    expect(transaction.socialAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: 'FACEBOOK',
        externalAccountId: '123',
        credentialRef: 'credential-1',
        status: 'CONNECTED',
      }),
      select: { id: true },
    });
    expect(transaction.destination.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: 'FACEBOOK',
        type: 'PAGE',
        externalId: '123',
        postingMode: 'API',
        socialAccountId: 'social-1',
      }),
      select: { id: true },
    });
  });

  it('updates an existing account credential and destination instead of duplicating them', async () => {
    const transaction = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'social-1', credentialRef: 'credential-1' }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      socialCredential: {
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      destination: {
        findFirst: vi.fn().mockResolvedValue({ id: 'destination-1' }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      },
    };
    const repository = new MetaConnectionsRepository(database as unknown as DatabaseService);

    await repository.promote([
      {
        platform: 'INSTAGRAM',
        externalAccountId: '456',
        displayName: 'RecruitOps',
        scopes: ['pages_show_list', 'pages_read_engagement', 'instagram_basic'],
        credential: encrypted('INSTAGRAM'),
        destinationType: 'PROFILE',
        destinationName: 'RecruitOps',
        destinationExternalId: '456',
      },
    ]);

    expect(transaction.socialCredential.update).toHaveBeenCalledWith({
      where: { id: 'credential-1' },
      data: expect.objectContaining({ platform: 'INSTAGRAM', keyId: 'key-1' }),
    });
    expect(transaction.socialAccount.create).not.toHaveBeenCalled();
    expect(transaction.destination.update).toHaveBeenCalledWith({
      where: { id: 'destination-1' },
      data: expect.objectContaining({ postingMode: 'API', enabled: true }),
    });
    expect(transaction.destination.create).not.toHaveBeenCalled();
  });

  it('rejects a credential encrypted for another platform before opening a transaction', async () => {
    const database = {
      client: {
        $transaction: vi.fn(),
      },
    };
    const repository = new MetaConnectionsRepository(database as unknown as DatabaseService);

    await expect(
      repository.promote([
        {
          platform: 'FACEBOOK',
          externalAccountId: '123',
          displayName: 'RecruitOps Page',
          scopes: [],
          credential: encrypted('INSTAGRAM'),
          destinationType: 'PAGE',
          destinationName: 'RecruitOps Page',
          destinationExternalId: '123',
        },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_CREDENTIAL_PLATFORM_MISMATCH' }),
    });
    expect(database.client.$transaction).not.toHaveBeenCalled();
  });
});
