import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipher } from '@recruitops/integrations';
import type { PublicationExecutionContext } from './publication-executor.js';
import {
  DefaultPublicationPublisherFactory,
  PrismaPublicationExecutionRepository,
  type ProviderMediaSigner,
} from './publication-runtime.js';

const publicationId = '33333333-3333-4333-8333-333333333333';
const socialAccountId = '11111111-1111-4111-8111-111111111111';
const destinationId = '22222222-2222-4222-8222-222222222222';
const testKey = Buffer.alloc(32, 7).toString('base64');
const cryptoEnv = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'v1',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ v1: testKey }),
} as NodeJS.ProcessEnv;

function encryptedCredential(platform: PublicationExecutionContext['platform']) {
  return new OAuthCredentialCipher().encrypt(
    platform,
    {
      accessToken: 'provider-token',
      scopes: [],
    },
    cryptoEnv,
  );
}

function context(
  overrides: Partial<PublicationExecutionContext> = {},
): PublicationExecutionContext {
  return {
    publicationId,
    attemptNumber: 1,
    platform: 'FACEBOOK',
    destinationPlatform: 'FACEBOOK',
    destinationId,
    destinationExternalId: '123456789',
    destinationEnabled: true,
    postingMode: 'API',
    socialAccountId,
    socialAccountPlatform: 'FACEBOOK',
    socialAccountStatus: 'CONNECTED',
    idempotencyKey: `publication:${publicationId}`,
    text: 'Hiring now',
    hashtags: [],
    metadata: {},
    media: [],
    credential: encryptedCredential('FACEBOOK'),
    ...overrides,
  };
}

describe('PrismaPublicationExecutionRepository', () => {
  it('does not read provider context when the same BullMQ attempt already claimed the publication', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn();
    const database = {
      publication: { updateMany, findUnique },
    } as unknown as PrismaClient;
    const repository = new PrismaPublicationExecutionRepository(database);

    await expect(repository.claim(publicationId, 2)).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: publicationId,
          retryCount: { lt: 2 },
        }),
      }),
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('allows a later BullMQ attempt to reclaim a PUBLISHING record left by a crashed attempt', async () => {
    const credential = encryptedCredential('FACEBOOK');
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue({
      id: publicationId,
      retryCount: 2,
      idempotencyKey: `publication:${publicationId}`,
      socialAccountId,
      postVariant: {
        platform: 'FACEBOOK',
        text: 'Hiring now',
        hashtags: ['jobs'],
        link: null,
        metadata: { locale: 'vi' },
        post: {
          mediaAssets: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              kind: 'IMAGE',
              storageKey: 'media/44444444.webp',
            },
          ],
        },
      },
      destination: {
        id: destinationId,
        platform: 'FACEBOOK',
        externalId: '123456789',
        enabled: true,
        postingMode: 'API',
      },
      socialAccount: {
        platform: 'FACEBOOK',
        status: 'CONNECTED',
        credential,
      },
    });
    const database = {
      publication: { updateMany, findUnique },
    } as unknown as PrismaClient;
    const repository = new PrismaPublicationExecutionRepository(database);

    const claimed = await repository.claim(publicationId, 2);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: publicationId,
          state: { in: ['PENDING', 'SCHEDULED', 'RETRY_WAITING', 'PUBLISHING'] },
          retryCount: { lt: 2 },
        },
        data: expect.objectContaining({
          state: 'PUBLISHING',
          retryCount: 2,
        }),
      }),
    );
    expect(claimed).toMatchObject({
      publicationId,
      attemptNumber: 2,
      platform: 'FACEBOOK',
      socialAccountId,
      credential: {
        keyId: 'v1',
        algorithm: 'aes-256-gcm',
      },
      media: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: 'IMAGE',
          storageKey: 'media/44444444.webp',
        },
      ],
    });
    expect(JSON.stringify(claimed)).not.toContain('provider-token');
  });
});

describe('DefaultPublicationPublisherFactory', () => {
  const mediaSigner: ProviderMediaSigner = {
    sign: vi.fn().mockResolvedValue('https://example.supabase.co/signed/media.webp'),
  };

  it('creates the matching publisher only after decrypting a valid connected credential', async () => {
    const factory = new DefaultPublicationPublisherFactory('v26.0', mediaSigner, cryptoEnv);

    await expect(factory.create(context())).resolves.toMatchObject({ platform: 'FACEBOOK' });
  });

  it('fails closed before provider execution for disabled destinations', async () => {
    const factory = new DefaultPublicationPublisherFactory('v26.0', mediaSigner, cryptoEnv);

    await expect(factory.create(context({ destinationEnabled: false }))).rejects.toMatchObject({
      code: 'PUBLICATION_DESTINATION_DISABLED',
    });
  });

  it('fails closed when the stored credential platform does not match the publication', async () => {
    const factory = new DefaultPublicationPublisherFactory('v26.0', mediaSigner, cryptoEnv);

    await expect(
      factory.create(
        context({
          credential: encryptedCredential('INSTAGRAM'),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'PUBLICATION_CREDENTIAL_PLATFORM_MISMATCH',
    });
  });

  it('keeps unsupported platforms terminal instead of guessing a provider implementation', async () => {
    const factory = new DefaultPublicationPublisherFactory('v26.0', mediaSigner, cryptoEnv);

    await expect(
      factory.create(
        context({
          platform: 'LINKEDIN',
          destinationPlatform: 'LINKEDIN',
          socialAccountPlatform: 'LINKEDIN',
          credential: encryptedCredential('LINKEDIN'),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'PUBLICATION_PLATFORM_EXECUTOR_NOT_IMPLEMENTED',
    });
  });
});
