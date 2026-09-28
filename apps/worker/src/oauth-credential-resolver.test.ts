import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipher } from '@recruitops/integrations';
import { WorkerOAuthCredentialResolver } from './oauth-credential-resolver.js';

const key = Buffer.alloc(32, 9).toString('base64');
const env = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: key }),
} as NodeJS.ProcessEnv;
const now = new Date('2026-09-28T14:00:00.000Z');

function encryptedCredential(expiresAt?: string) {
  const encrypted = new OAuthCredentialCipher().encrypt(
    'FACEBOOK',
    {
      accessToken: 'page-access-token',
      refreshToken: 'must-not-be-returned',
      scopes: ['pages_manage_posts'],
      expiresAt,
    },
    env,
  );
  return {
    platform: encrypted.platform,
    keyId: encrypted.keyId,
    algorithm: encrypted.algorithm,
    iv: Buffer.from(encrypted.iv),
    authTag: Buffer.from(encrypted.authTag),
    ciphertext: Buffer.from(encrypted.ciphertext),
  };
}

function createPrisma(account: unknown) {
  const findUnique = vi.fn().mockResolvedValue(account);
  return {
    prisma: { socialAccount: { findUnique } } as unknown as PrismaClient,
    findUnique,
  };
}

describe('WorkerOAuthCredentialResolver', () => {
  it('decrypts and returns only the provider access token for a connected account', async () => {
    const { prisma, findUnique } = createPrisma({
      platform: 'FACEBOOK',
      status: 'CONNECTED',
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      credential: encryptedCredential('2026-10-01T00:00:00.000Z'),
    });
    const resolver = new WorkerOAuthCredentialResolver(prisma, undefined, env, () => now);

    await expect(
      resolver.resolveAccessToken('11111111-1111-4111-8111-111111111111', 'FACEBOOK'),
    ).resolves.toBe('page-access-token');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '11111111-1111-4111-8111-111111111111' },
        select: expect.objectContaining({
          platform: true,
          status: true,
          expiresAt: true,
          credential: expect.any(Object),
        }),
      }),
    );
  });

  it('fails closed when the social account platform does not match the publication', async () => {
    const { prisma } = createPrisma({
      platform: 'INSTAGRAM',
      status: 'CONNECTED',
      expiresAt: null,
      credential: encryptedCredential(),
    });
    const resolver = new WorkerOAuthCredentialResolver(prisma, undefined, env, () => now);

    await expect(
      resolver.resolveAccessToken('11111111-1111-4111-8111-111111111111', 'FACEBOOK'),
    ).rejects.toThrow('PUBLICATION_SOCIAL_ACCOUNT_PLATFORM_MISMATCH');
  });

  it('rejects expired account metadata before decrypting credentials', async () => {
    const { prisma } = createPrisma({
      platform: 'FACEBOOK',
      status: 'CONNECTED',
      expiresAt: new Date('2026-09-28T13:59:59.000Z'),
      credential: encryptedCredential(),
    });
    const resolver = new WorkerOAuthCredentialResolver(prisma, undefined, env, () => now);

    await expect(
      resolver.resolveAccessToken('11111111-1111-4111-8111-111111111111', 'FACEBOOK'),
    ).rejects.toThrow('PUBLICATION_SOCIAL_ACCOUNT_EXPIRED');
  });

  it('rejects an expired encrypted credential payload', async () => {
    const { prisma } = createPrisma({
      platform: 'FACEBOOK',
      status: 'CONNECTED',
      expiresAt: null,
      credential: encryptedCredential('2026-09-28T13:59:59.000Z'),
    });
    const resolver = new WorkerOAuthCredentialResolver(prisma, undefined, env, () => now);

    await expect(
      resolver.resolveAccessToken('11111111-1111-4111-8111-111111111111', 'FACEBOOK'),
    ).rejects.toThrow('PUBLICATION_SOCIAL_CREDENTIAL_EXPIRED');
  });

  it('rejects accounts without a credential relation', async () => {
    const { prisma } = createPrisma({
      platform: 'FACEBOOK',
      status: 'CONNECTED',
      expiresAt: null,
      credential: null,
    });
    const resolver = new WorkerOAuthCredentialResolver(prisma, undefined, env, () => now);

    await expect(
      resolver.resolveAccessToken('11111111-1111-4111-8111-111111111111', 'FACEBOOK'),
    ).rejects.toThrow('PUBLICATION_SOCIAL_CREDENTIAL_MISSING');
  });
});
