import type { PublishCommand } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipherCore } from '@recruitops/integrations';
import { describe, expect, it, vi } from 'vitest';
import {
  createProductionPublisherRegistry,
  PrismaTikTokPublishingContextResolver,
  WorkerPublishingContextError,
} from './facebook-publishing-runtime.js';
import { readWorkerRuntimeConfig, WorkerRuntimeConfigurationError } from './runtime.js';

const encryptionKey = Buffer.alloc(32, 13).toString('base64');
const credentialEnv = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: encryptionKey }),
};

const command: PublishCommand = {
  platform: 'TIKTOK',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'Hiring',
    hashtags: [],
  },
};

function createDatabase(destination: unknown): PrismaClient {
  return {
    destination: {
      findUnique: vi.fn().mockResolvedValue(destination),
    },
  } as unknown as PrismaClient;
}

describe('PrismaTikTokPublishingContextResolver', () => {
  it('decrypts a connected video.publish credential only at execution time', async () => {
    const cipher = new OAuthCredentialCipherCore();
    const encrypted = cipher.encrypt(
      'TIKTOK',
      {
        accessToken: 'tiktok-access-token',
        refreshToken: 'tiktok-refresh-token',
        scopes: ['user.info.basic', 'video.publish'],
      },
      credentialEnv,
    );
    const database = createDatabase({
      id: command.destinationId,
      platform: 'TIKTOK',
      socialAccountId: command.socialAccountId,
      socialAccount: {
        id: command.socialAccountId,
        platform: 'TIKTOK',
        status: 'CONNECTED',
        scopes: ['user.info.basic', 'video.publish'],
        credential: {
          platform: 'TIKTOK',
          keyId: encrypted.keyId,
          algorithm: encrypted.algorithm,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
        },
      },
    });

    const resolver = new PrismaTikTokPublishingContextResolver(database, cipher, credentialEnv);

    await expect(resolver.resolve(command)).resolves.toEqual({
      platform: 'TIKTOK',
      accessToken: 'tiktok-access-token',
    });
  });

  it('fails before decryption when the account lacks video.publish', async () => {
    const database = createDatabase({
      id: command.destinationId,
      platform: 'TIKTOK',
      socialAccountId: command.socialAccountId,
      socialAccount: {
        id: command.socialAccountId,
        platform: 'TIKTOK',
        status: 'CONNECTED',
        scopes: ['user.info.basic'],
        credential: null,
      },
    });
    const resolver = new PrismaTikTokPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      credentialEnv,
    );

    await expect(resolver.resolve(command)).rejects.toMatchObject<
      Partial<WorkerPublishingContextError>
    >({ code: 'WORKER_TIKTOK_SCOPE_REQUIRED' });
  });
});

describe('TikTok publishing runtime activation', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/recruitops',
    REDIS_URL: 'rediss://worker:secret@redis.example.com:6380/2',
    META_GRAPH_API_VERSION: 'v26.0',
    ...credentialEnv,
  };

  it('keeps TikTok publishing disabled unless explicitly enabled', () => {
    expect(readWorkerRuntimeConfig(baseEnv).tiktokPublishing).toBeUndefined();
  });

  it('requires private-media signing configuration when TikTok is enabled', () => {
    expect(() =>
      readWorkerRuntimeConfig({
        ...baseEnv,
        PUBLISHING_TIKTOK_ENABLED: 'true',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_TIKTOK_MEDIA_SIGNING_CONFIG_INVALID',
      }),
    );

    expect(
      readWorkerRuntimeConfig({
        ...baseEnv,
        PUBLISHING_TIKTOK_ENABLED: 'true',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEY: `sb_secret_${'x'.repeat(32)}`,
      }).tiktokPublishing,
    ).toMatchObject({ enabled: true });
  });

  it('registers TikTok only when the media resolver is explicitly supplied', () => {
    const database = createDatabase(null);
    const disabled = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env: credentialEnv,
    });
    expect(disabled.get('TIKTOK')).toBeUndefined();

    const enabled = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env: credentialEnv,
      tiktokMediaResolver: {
        resolve: vi.fn().mockResolvedValue([]),
      },
    });
    expect(enabled.get('TIKTOK')?.platform).toBe('TIKTOK');
  });
});
