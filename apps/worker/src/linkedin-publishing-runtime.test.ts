import type { PublishCommand } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipherCore } from '@recruitops/integrations';
import { describe, expect, it, vi } from 'vitest';
import {
  createProductionPublisherRegistry,
  PrismaLinkedInPublishingContextResolver,
  WorkerPublishingContextError,
} from './facebook-publishing-runtime.js';
import { readWorkerRuntimeConfig, WorkerRuntimeConfigurationError } from './runtime.js';

const encryptionKey = Buffer.alloc(32, 11).toString('base64');
const credentialEnv = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: encryptionKey }),
};

const command: PublishCommand = {
  platform: 'LINKEDIN',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs'],
  },
};

function createDatabase(destination: unknown): PrismaClient {
  return {
    destination: {
      findUnique: vi.fn().mockResolvedValue(destination),
    },
  } as unknown as PrismaClient;
}

describe('PrismaLinkedInPublishingContextResolver', () => {
  it('decrypts a connected member credential and derives the Person URN at execution time', async () => {
    const cipher = new OAuthCredentialCipherCore();
    const encrypted = cipher.encrypt(
      'LINKEDIN',
      {
        accessToken: 'linkedin-member-token',
        scopes: ['openid', 'profile', 'w_member_social'],
      },
      credentialEnv,
    );
    const database = createDatabase({
      id: command.destinationId,
      platform: 'LINKEDIN',
      externalId: 'member_abc-123',
      socialAccountId: command.socialAccountId,
      socialAccount: {
        id: command.socialAccountId,
        platform: 'LINKEDIN',
        status: 'CONNECTED',
        scopes: ['openid', 'profile', 'w_member_social'],
        credential: {
          platform: 'LINKEDIN',
          keyId: encrypted.keyId,
          algorithm: encrypted.algorithm,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
        },
      },
    });

    const resolver = new PrismaLinkedInPublishingContextResolver(database, cipher, credentialEnv);

    await expect(resolver.resolve(command)).resolves.toEqual({
      platform: 'LINKEDIN',
      authorUrn: 'urn:li:person:member_abc-123',
      accessToken: 'linkedin-member-token',
    });
  });

  it('fails before decryption when the persisted account lacks w_member_social', async () => {
    const database = createDatabase({
      id: command.destinationId,
      platform: 'LINKEDIN',
      externalId: 'member_abc-123',
      socialAccountId: command.socialAccountId,
      socialAccount: {
        id: command.socialAccountId,
        platform: 'LINKEDIN',
        status: 'CONNECTED',
        scopes: ['openid', 'profile'],
        credential: null,
      },
    });
    const resolver = new PrismaLinkedInPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      credentialEnv,
    );

    await expect(resolver.resolve(command)).rejects.toMatchObject<
      Partial<WorkerPublishingContextError>
    >({ code: 'WORKER_LINKEDIN_SCOPE_REQUIRED' });
  });
});

describe('LinkedIn publishing runtime activation', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/recruitops',
    REDIS_URL: 'rediss://worker:secret@redis.example.com:6380/2',
    META_GRAPH_API_VERSION: 'v26.0',
    ...credentialEnv,
  };

  it('keeps LinkedIn publishing disabled unless explicitly enabled', () => {
    expect(readWorkerRuntimeConfig(baseEnv).linkedinPublishing).toBeUndefined();
  });

  it('requires a YYYYMM LinkedIn API version when publishing is enabled', () => {
    expect(() =>
      readWorkerRuntimeConfig({
        ...baseEnv,
        PUBLISHING_LINKEDIN_ENABLED: 'true',
        LINKEDIN_API_VERSION: 'v202601',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkerRuntimeConfigurationError>>({
        code: 'WORKER_LINKEDIN_API_VERSION_INVALID',
      }),
    );

    expect(
      readWorkerRuntimeConfig({
        ...baseEnv,
        PUBLISHING_LINKEDIN_ENABLED: 'true',
        LINKEDIN_API_VERSION: '202601',
      }).linkedinPublishing,
    ).toEqual({ enabled: true, apiVersion: '202601' });
  });

  it('registers the LinkedIn publisher only when an API version is supplied by composition', () => {
    const database = createDatabase(null);
    const disabled = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env: credentialEnv,
    });
    expect(disabled.get('LINKEDIN')).toBeUndefined();

    const enabled = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env: credentialEnv,
      linkedinApiVersion: '202601',
    });
    expect(enabled.get('LINKEDIN')?.platform).toBe('LINKEDIN');
  });
});
