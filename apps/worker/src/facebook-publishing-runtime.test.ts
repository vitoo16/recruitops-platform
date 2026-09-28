import { describe, expect, it, vi } from 'vitest';
import type { PublishCommand } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipherCore } from '@recruitops/integrations';
import {
  createProductionPublisherRegistry,
  PrismaFacebookPublishingContextResolver,
  WorkerPublishingContextError,
} from './facebook-publishing-runtime.js';

const encryptionKey = Buffer.alloc(32, 9).toString('base64');
const env = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: encryptionKey }),
};

const command: PublishCommand = {
  platform: 'FACEBOOK',
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

describe('PrismaFacebookPublishingContextResolver', () => {
  it('decrypts the selected connected Facebook credential only at execution time', async () => {
    const cipher = new OAuthCredentialCipherCore();
    const encrypted = cipher.encrypt(
      'FACEBOOK',
      {
        accessToken: 'page-access-token',
        scopes: ['pages_manage_posts'],
      },
      env,
    );
    const database = createDatabase({
      id: command.destinationId,
      platform: 'FACEBOOK',
      externalId: '123456789',
      socialAccountId: command.socialAccountId,
      socialAccount: {
        id: command.socialAccountId,
        platform: 'FACEBOOK',
        status: 'CONNECTED',
        credential: {
          platform: 'FACEBOOK',
          keyId: encrypted.keyId,
          algorithm: encrypted.algorithm,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
        },
      },
    });

    const resolver = new PrismaFacebookPublishingContextResolver(database, cipher, env);

    await expect(resolver.resolve(command)).resolves.toEqual({
      platform: 'FACEBOOK',
      destinationExternalId: '123456789',
      accessToken: 'page-access-token',
    });
  });

  it('fails closed when the publication account does not own the destination credential', async () => {
    const database = createDatabase({
      id: command.destinationId,
      platform: 'FACEBOOK',
      externalId: '123456789',
      socialAccountId: '44444444-4444-4444-8444-444444444444',
      socialAccount: {
        id: '44444444-4444-4444-8444-444444444444',
        platform: 'FACEBOOK',
        status: 'CONNECTED',
        credential: null,
      },
    });
    const resolver = new PrismaFacebookPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      env,
    );

    await expect(resolver.resolve(command)).rejects.toMatchObject<
      Partial<WorkerPublishingContextError>
    >({
      code: 'WORKER_FACEBOOK_CONTEXT_MISMATCH',
    });
  });
});

describe('createProductionPublisherRegistry', () => {
  it('registers only Facebook until media-selection semantics exist for media providers', () => {
    const database = createDatabase(null);
    const registry = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env,
    });

    expect(registry.get('FACEBOOK')?.platform).toBe('FACEBOOK');
    expect(registry.get('INSTAGRAM')).toBeUndefined();
    expect(registry.get('THREADS')).toBeUndefined();
  });
});
