import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadsConnectionError } from '@recruitops/integrations';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { ThreadsConnectionClientFactory } from './threads-connection-client.factory.js';
import type { ThreadsConnectionsRepository } from './threads-connections.repository.js';
import { ThreadsConnectionsService } from './threads-connections.service.js';
import type { ThreadsOAuthStateStore } from './threads-oauth-state.store.js';

const userId = '11111111-1111-4111-8111-111111111111';
const validState = 's'.repeat(43);

function encryptedThreads() {
  return {
    platform: 'THREADS' as const,
    keyId: 'key-1',
    algorithm: 'aes-256-gcm' as const,
    iv: Uint8Array.from([1]),
    authTag: Uint8Array.from([2]),
    ciphertext: Uint8Array.from([3]),
  };
}

function createHarness() {
  const states = {
    create: vi.fn().mockResolvedValue({ expiresAt: '2026-09-29T01:10:00.000Z' }),
    consume: vi.fn().mockResolvedValue({
      userId,
      createdAt: '2026-09-29T01:00:00.000Z',
    }),
  };
  const provider = {
    buildAuthorizationUrl: vi
      .fn()
      .mockReturnValue('https://threads.net/oauth/authorize?state=test'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: 'short-token',
      userId: '12345',
    }),
    exchangeLongLivedToken: vi.fn().mockResolvedValue({
      accessToken: 'long-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    }),
    getProfile: vi.fn().mockResolvedValue({
      id: '12345',
      username: 'recruitops',
      name: 'RecruitOps',
    }),
  };
  const clients = { create: vi.fn().mockReturnValue(provider) };
  const cipher = {
    encrypt: vi.fn().mockReturnValue(encryptedThreads()),
  };
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    promote: vi.fn().mockResolvedValue({
      socialAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      destinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      externalAccountId: '12345',
      displayName: 'RecruitOps',
      expiresAt: '2026-11-28T01:00:00.000Z',
    }),
  };
  const service = new ThreadsConnectionsService(
    states as unknown as ThreadsOAuthStateStore,
    cipher as unknown as OAuthCredentialCipher,
    clients as unknown as ThreadsConnectionClientFactory,
    repository as unknown as ThreadsConnectionsRepository,
  );

  return { service, states, provider, clients, cipher, repository };
}

beforeEach(() => {
  vi.stubEnv('OAUTH_CREDENTIAL_ACTIVE_KEY_ID', 'key-1');
  vi.stubEnv(
    'OAUTH_CREDENTIAL_ENCRYPTION_KEYS',
    JSON.stringify({ 'key-1': Buffer.alloc(32, 1).toString('base64') }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('ThreadsConnectionsService', () => {
  it('creates a strong one-time OAuth state before returning authorization', async () => {
    const { service, states, provider } = createHarness();

    await expect(service.start(userId)).resolves.toEqual({
      authorizationUrl: 'https://threads.net/oauth/authorize?state=test',
      expiresAt: '2026-09-29T01:10:00.000Z',
    });

    const state = states.create.mock.calls[0]![0].state as string;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(states.create).toHaveBeenCalledWith({ state, userId });
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith(state);
  });

  it('rejects an expired or replayed state before provider access', async () => {
    const { service, states, provider } = createHarness();
    states.consume.mockResolvedValueOnce(null);

    await expect(
      service.callback({ state: validState, code: 'authorization-code' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'THREADS_OAUTH_STATE_INVALID_OR_EXPIRED' }),
    });
    expect(provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('normalizes provider denial without making token calls', async () => {
    const { service, provider } = createHarness();

    await expect(
      service.callback({ state: validState, error: 'access_denied' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'THREADS_OAUTH_DENIED' }),
    });
    expect(provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('fails closed when the authorization user id does not match the verified profile', async () => {
    const { service, provider, repository, cipher } = createHarness();
    provider.getProfile.mockResolvedValueOnce({
      id: '99999',
      username: 'different-user',
    });

    await expect(
      service.callback({ state: validState, code: 'authorization-code' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'THREADS_OAUTH_ACCOUNT_MISMATCH' }),
    });
    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('encrypts the long-lived token with required publishing scopes before promotion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T01:00:00.000Z'));
    const { service, states, cipher, repository } = createHarness();

    const result = await service.callback({ state: validState, code: 'authorization-code' });

    expect(states.consume).toHaveBeenCalledWith(validState);
    expect(cipher.encrypt).toHaveBeenCalledWith('THREADS', {
      accessToken: 'long-token',
      tokenType: 'bearer',
      scopes: ['threads_basic', 'threads_content_publish'],
      expiresAt: '2026-11-28T01:00:00.000Z',
    });
    expect(repository.promote).toHaveBeenCalledWith({
      externalAccountId: '12345',
      displayName: 'RecruitOps',
      scopes: ['threads_basic', 'threads_content_publish'],
      expiresAt: '2026-11-28T01:00:00.000Z',
      credential: encryptedThreads(),
    });
    expect(JSON.stringify(result)).not.toContain('long-token');
    expect(JSON.stringify(result)).not.toContain('short-token');
  });

  it('normalizes provider errors without exposing provider detail', async () => {
    const { service, provider } = createHarness();
    provider.exchangeAuthorizationCode.mockRejectedValueOnce(
      new ThreadsConnectionError('THREADS_TOKEN_EXCHANGE_FAILED_PROVIDER_190', 401),
    );

    await expect(
      service.callback({ state: validState, code: 'authorization-code' }),
    ).rejects.toMatchObject({
      response: {
        code: 'THREADS_TOKEN_EXCHANGE_FAILED_PROVIDER_190',
        message: 'Threads provider request failed',
      },
    });
  });
});
