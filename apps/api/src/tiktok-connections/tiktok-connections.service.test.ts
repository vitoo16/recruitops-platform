import { BadRequestException } from '@nestjs/common';
import type { TikTokConnectionProvider } from '@recruitops/integrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { TikTokConnectionClientFactory } from './tiktok-connection-client.factory.js';
import type { TikTokConnectionsRepository } from './tiktok-connections.repository.js';
import { TikTokConnectionsService } from './tiktok-connections.service.js';
import type { TikTokOAuthStateStore } from './tiktok-oauth-state.store.js';

const userId = '2ca934f4-8e91-4c9f-a64b-04f7cf992f88';
const state = 'a'.repeat(43);
const activeKey = process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID;
const keyring = process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS;

function setup(scope = 'user.info.basic,video.publish') {
  const provider = {
    buildAuthorizationUrl: vi.fn().mockReturnValue('https://www.tiktok.com/v2/auth/authorize/'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      openId: 'open-id',
      scope,
      tokenType: 'Bearer',
      expiresInSeconds: 86400,
      refreshExpiresInSeconds: 31536000,
    }),
    getUserInfo: vi.fn().mockResolvedValue({ openId: 'open-id', displayName: 'TikTok Recruiter' }),
  } as unknown as TikTokConnectionProvider;
  const states = {
    create: vi.fn().mockResolvedValue({ expiresAt: '2026-09-30T05:00:00.000Z' }),
    consume: vi.fn().mockResolvedValue({ userId, createdAt: '2026-09-30T04:50:00.000Z' }),
  } as unknown as TikTokOAuthStateStore;
  const cipher = {
    encrypt: vi.fn().mockReturnValue({
      platform: 'TIKTOK',
      keyId: 'test-key',
      algorithm: 'aes-256-gcm',
      iv: new Uint8Array(12),
      authTag: new Uint8Array(16),
      ciphertext: new Uint8Array([1]),
    }),
  } as unknown as OAuthCredentialCipher;
  const clients = {
    create: vi.fn().mockReturnValue(provider),
  } as unknown as TikTokConnectionClientFactory;
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    promote: vi
      .fn()
      .mockResolvedValue({ socialAccountId: 'account-id', destinationId: 'destination-id' }),
  } as unknown as TikTokConnectionsRepository;
  return {
    service: new TikTokConnectionsService(states, cipher, clients, repository),
    states,
    provider,
    cipher,
    repository,
  };
}

beforeEach(() => {
  process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID = 'test-key';
  process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS = JSON.stringify({
    'test-key': Buffer.alloc(32, 7).toString('base64'),
  });
});

afterEach(() => {
  if (activeKey === undefined) delete process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID;
  else process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID = activeKey;
  if (keyring === undefined) delete process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS;
  else process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS = keyring;
  vi.restoreAllMocks();
});

describe('TikTokConnectionsService', () => {
  it('creates one-time state before returning authorization URL', async () => {
    const { service, states } = setup();
    await expect(service.start(userId)).resolves.toMatchObject({
      authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    });
    expect(states.create).toHaveBeenCalledWith({
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      userId,
    });
  });

  it('encrypts access and refresh credentials before promotion', async () => {
    const { service, cipher, repository } = setup();
    await service.callback({ state, code: 'code' });
    expect(cipher.encrypt).toHaveBeenCalledWith(
      'TIKTOK',
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        scopes: ['user.info.basic', 'video.publish'],
      }),
    );
    expect(repository.promote).toHaveBeenCalledWith(
      expect.objectContaining({ externalAccountId: 'open-id', displayName: 'TikTok Recruiter' }),
    );
  });

  it('fails closed when required direct-post scope was not granted', async () => {
    const { service, repository } = setup('user.info.basic');
    await expect(service.callback({ state, code: 'code' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIKTOK_OAUTH_REQUIRED_SCOPE_MISSING' }),
    });
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('rejects token/profile identity mismatch', async () => {
    const { service, provider, repository } = setup();
    vi.mocked(provider.getUserInfo).mockResolvedValueOnce({
      openId: 'other-open-id',
      displayName: 'Other',
    });
    await expect(service.callback({ state, code: 'code' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIKTOK_OAUTH_IDENTITY_MISMATCH' }),
    });
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('consumes state before a denied callback', async () => {
    const { service, states } = setup();
    await expect(service.callback({ state, error: 'access_denied' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(states.consume).toHaveBeenCalledWith(state);
  });
});
