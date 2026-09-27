import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from './oauth-credential-cipher.js';
import { SocialCredentialsRepository } from './social-credentials.repository.js';

const encrypted: EncryptedOAuthCredential = {
  platform: 'FACEBOOK',
  keyId: 'v1',
  algorithm: 'aes-256-gcm',
  iv: Uint8Array.from([1, 2, 3]),
  authTag: Uint8Array.from([4, 5, 6]),
  ciphertext: Uint8Array.from([7, 8, 9]),
};

describe('SocialCredentialsRepository', () => {
  it('copies encrypted bytes into Prisma-compatible buffers before persistence', async () => {
    const credentialCreate = vi.fn().mockResolvedValue({ id: 'credential-id' });
    const accountUpdate = vi.fn().mockResolvedValue({});
    const transactionClient = {
      socialAccount: {
        findUnique: vi.fn().mockResolvedValue({ platform: 'FACEBOOK', credentialRef: null }),
        update: accountUpdate,
      },
      socialCredential: {
        create: credentialCreate,
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<void>) =>
          callback(transactionClient),
        ),
      },
    } as unknown as DatabaseService;
    const repository = new SocialCredentialsRepository(database);

    await repository.upsertForSocialAccount('account-id', encrypted);

    const createInput = credentialCreate.mock.calls[0]?.[0] as {
      data: {
        iv: Uint8Array;
        authTag: Uint8Array;
        ciphertext: Uint8Array;
      };
    };
    expect(createInput.data.iv).toEqual(encrypted.iv);
    expect(createInput.data.authTag).toEqual(encrypted.authTag);
    expect(createInput.data.ciphertext).toEqual(encrypted.ciphertext);
    expect(createInput.data.iv).not.toBe(encrypted.iv);
    expect(createInput.data.authTag).not.toBe(encrypted.authTag);
    expect(createInput.data.ciphertext).not.toBe(encrypted.ciphertext);
    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: 'account-id' },
      data: { credentialRef: 'credential-id' },
    });
  });

  it('rejects credentials whose platform does not match the social account', async () => {
    const credentialCreate = vi.fn();
    const transactionClient = {
      socialAccount: {
        findUnique: vi.fn().mockResolvedValue({ platform: 'LINKEDIN', credentialRef: null }),
      },
      socialCredential: {
        create: credentialCreate,
      },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<void>) =>
          callback(transactionClient),
        ),
      },
    } as unknown as DatabaseService;
    const repository = new SocialCredentialsRepository(database);

    await expect(repository.upsertForSocialAccount('account-id', encrypted)).rejects.toMatchObject({
      response: { code: 'SOCIAL_CREDENTIAL_PLATFORM_MISMATCH' },
    });
    expect(credentialCreate).not.toHaveBeenCalled();
  });

  it('loads only a supported encrypted envelope for the matching account platform', async () => {
    const stored = {
      id: 'credential-id',
      platform: 'FACEBOOK',
      keyId: 'v1',
      algorithm: 'aes-256-gcm',
      iv: Uint8Array.from([1, 2, 3]),
      authTag: Uint8Array.from([4, 5, 6]),
      ciphertext: Uint8Array.from([7, 8, 9]),
    };
    const database = {
      client: {
        socialAccount: {
          findUnique: vi.fn().mockResolvedValue({
            platform: 'FACEBOOK',
            credential: stored,
          }),
        },
      },
    } as unknown as DatabaseService;
    const repository = new SocialCredentialsRepository(database);

    await expect(repository.findForSocialAccount('account-id')).resolves.toEqual(stored);
  });
});
