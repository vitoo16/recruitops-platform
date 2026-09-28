import type { PublishCommand } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import {
  OAuthCredentialCipherCore,
  type MetaPublishingMediaResolver,
  type ThreadsPublishingMediaResolver,
} from '@recruitops/integrations';
import { describe, expect, it, vi } from 'vitest';
import {
  createProductionPublisherRegistry,
  PrismaFacebookPublishingContextResolver,
  PrismaInstagramPublishingContextResolver,
  PrismaThreadsPublishingContextResolver,
  WorkerPublishingContextError,
} from './facebook-publishing-runtime.js';

const encryptionKey = Buffer.alloc(32, 9).toString('base64');
const env = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: encryptionKey }),
};

const facebookCommand: PublishCommand = {
  platform: 'FACEBOOK',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs'],
  },
};

const instagramCommand: PublishCommand = {
  ...facebookCommand,
  platform: 'INSTAGRAM',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs'],
    mediaIds: ['44444444-4444-4444-8444-444444444444'],
  },
};

const threadsCommand: PublishCommand = {
  ...facebookCommand,
  platform: 'THREADS',
  payload: {
    text: 'We are hiring on Threads',
    hashtags: ['jobs'],
    mediaIds: ['44444444-4444-4444-8444-444444444444'],
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
      id: facebookCommand.destinationId,
      platform: 'FACEBOOK',
      externalId: '123456789',
      socialAccountId: facebookCommand.socialAccountId,
      socialAccount: {
        id: facebookCommand.socialAccountId,
        platform: 'FACEBOOK',
        status: 'CONNECTED',
        scopes: ['pages_manage_posts'],
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

    await expect(resolver.resolve(facebookCommand)).resolves.toEqual({
      platform: 'FACEBOOK',
      destinationExternalId: '123456789',
      accessToken: 'page-access-token',
    });
  });

  it('fails closed when the publication account does not own the destination credential', async () => {
    const database = createDatabase({
      id: facebookCommand.destinationId,
      platform: 'FACEBOOK',
      externalId: '123456789',
      socialAccountId: '55555555-5555-4555-8555-555555555555',
      socialAccount: {
        id: '55555555-5555-4555-8555-555555555555',
        platform: 'FACEBOOK',
        status: 'CONNECTED',
        scopes: ['pages_manage_posts'],
        credential: null,
      },
    });
    const resolver = new PrismaFacebookPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      env,
    );

    await expect(resolver.resolve(facebookCommand)).rejects.toMatchObject<
      Partial<WorkerPublishingContextError>
    >({
      code: 'WORKER_FACEBOOK_CONTEXT_MISMATCH',
    });
  });
});

describe('PrismaInstagramPublishingContextResolver', () => {
  it('decrypts the Page access token for a connected Instagram Professional destination', async () => {
    const cipher = new OAuthCredentialCipherCore();
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
    ];
    const encrypted = cipher.encrypt(
      'INSTAGRAM',
      {
        accessToken: 'instagram-page-access-token',
        scopes,
      },
      env,
    );
    const database = createDatabase({
      id: instagramCommand.destinationId,
      platform: 'INSTAGRAM',
      externalId: '17841400000000000',
      socialAccountId: instagramCommand.socialAccountId,
      socialAccount: {
        id: instagramCommand.socialAccountId,
        platform: 'INSTAGRAM',
        status: 'CONNECTED',
        scopes,
        credential: {
          platform: 'INSTAGRAM',
          keyId: encrypted.keyId,
          algorithm: encrypted.algorithm,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
        },
      },
    });

    const resolver = new PrismaInstagramPublishingContextResolver(database, cipher, env);

    await expect(resolver.resolve(instagramCommand)).resolves.toEqual({
      platform: 'INSTAGRAM',
      destinationExternalId: '17841400000000000',
      accessToken: 'instagram-page-access-token',
    });
  });

  it('fails before decryption when the persisted account lacks Instagram publishing scope', async () => {
    const database = createDatabase({
      id: instagramCommand.destinationId,
      platform: 'INSTAGRAM',
      externalId: '17841400000000000',
      socialAccountId: instagramCommand.socialAccountId,
      socialAccount: {
        id: instagramCommand.socialAccountId,
        platform: 'INSTAGRAM',
        status: 'CONNECTED',
        scopes: ['instagram_basic'],
        credential: null,
      },
    });
    const resolver = new PrismaInstagramPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      env,
    );

    await expect(resolver.resolve(instagramCommand)).rejects.toMatchObject({
      code: 'WORKER_INSTAGRAM_SCOPE_REQUIRED',
    });
  });
});

describe('PrismaThreadsPublishingContextResolver', () => {
  it('decrypts the selected connected Threads credential only at execution time', async () => {
    const cipher = new OAuthCredentialCipherCore();
    const scopes = ['threads_basic', 'threads_content_publish'];
    const encrypted = cipher.encrypt(
      'THREADS',
      {
        accessToken: 'threads-user-access-token',
        scopes,
      },
      env,
    );
    const database = createDatabase({
      id: threadsCommand.destinationId,
      platform: 'THREADS',
      socialAccountId: threadsCommand.socialAccountId,
      socialAccount: {
        id: threadsCommand.socialAccountId,
        platform: 'THREADS',
        status: 'CONNECTED',
        scopes,
        credential: {
          platform: 'THREADS',
          keyId: encrypted.keyId,
          algorithm: encrypted.algorithm,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
        },
      },
    });

    const resolver = new PrismaThreadsPublishingContextResolver(database, cipher, env);

    await expect(resolver.resolve(threadsCommand)).resolves.toEqual({
      platform: 'THREADS',
      accessToken: 'threads-user-access-token',
    });
  });

  it('fails before decryption when the persisted account lacks Threads publishing scope', async () => {
    const database = createDatabase({
      id: threadsCommand.destinationId,
      platform: 'THREADS',
      socialAccountId: threadsCommand.socialAccountId,
      socialAccount: {
        id: threadsCommand.socialAccountId,
        platform: 'THREADS',
        status: 'CONNECTED',
        scopes: ['threads_basic'],
        credential: null,
      },
    });
    const resolver = new PrismaThreadsPublishingContextResolver(
      database,
      new OAuthCredentialCipherCore(),
      env,
    );

    await expect(resolver.resolve(threadsCommand)).rejects.toMatchObject({
      code: 'WORKER_THREADS_SCOPE_REQUIRED',
    });
  });
});

describe('createProductionPublisherRegistry', () => {
  it('keeps media providers disabled unless trusted media resolvers are explicitly supplied', () => {
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

  it('registers Instagram only when the worker composition supplies its media resolver', () => {
    const database = createDatabase(null);
    const mediaResolver: MetaPublishingMediaResolver = {
      resolve: vi.fn().mockResolvedValue([]),
    };
    const registry = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env,
      instagramMediaResolver: mediaResolver,
    });

    expect(registry.get('FACEBOOK')?.platform).toBe('FACEBOOK');
    expect(registry.get('INSTAGRAM')?.platform).toBe('INSTAGRAM');
    expect(registry.get('THREADS')).toBeUndefined();
  });

  it('registers Threads only when the worker composition supplies its media resolver', () => {
    const database = createDatabase(null);
    const mediaResolver: ThreadsPublishingMediaResolver = {
      resolve: vi.fn().mockResolvedValue([]),
    };
    const registry = createProductionPublisherRegistry({
      database,
      graphApiVersion: 'v26.0',
      env,
      threadsMediaResolver: mediaResolver,
    });

    expect(registry.get('FACEBOOK')?.platform).toBe('FACEBOOK');
    expect(registry.get('INSTAGRAM')).toBeUndefined();
    expect(registry.get('THREADS')?.platform).toBe('THREADS');
  });
});
