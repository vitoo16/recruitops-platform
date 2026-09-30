import { BadRequestException } from '@nestjs/common';
import type { TikTokConnectionProvider, TikTokPublishingProvider } from '@recruitops/integrations';
import { TikTokPublishingError } from '@recruitops/integrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { TikTokConnectionClientFactory } from './tiktok-connection-client.factory.js';
import type { TikTokConnectionsRepository } from './tiktok-connections.repository.js';
import { TikTokConnectionsService } from './tiktok-connections.service.js';
import type { TikTokOAuthStateStore } from './tiktok-oauth-state.store.js';
import type { TikTokPublishingClientFactory } from './tiktok-publishing-client.factory.js';

const userId = '2ca934f4-8e91-4c9f-a64b-04f7cf992f88';
const accountId = '6aeb5a1e-ef8d-4e69-af51-7efbd8e2977c';
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
  const publishingProvider = {
    queryCreatorInfo: vi.fn().mockResolvedValue({
      creatorUsername: 'recruiter',
      creatorNickname: 'Recruiter',
      privacyLevelOptions: ['SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: false,
      maxVideoPostDurationSeconds: 300,
    }),
  } as unknown as TikTokPublishingProvider;
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
    decrypt: vi.fn().mockReturnValue({
      accessToken: 'publishing-access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scopes: ['user.info.basic', 'video.publish'],
      expiresAt: '2026-10-01T00:00:00.000Z',
      refreshExpiresAt: '2027-09-30T00:00:00.000Z',
    }),
  } as unknown as OAuthCredentialCipher;
  const clients = {
    create: vi.fn().mockReturnValue(provider),
  } as unknown as TikTokConnectionClientFactory;
  const publishingClients = {
    create: vi.fn().mockReturnValue(publishingProvider),
  } as unknown as TikTokPublishingClientFactory;
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    findPublishingCredential: vi.fn().mockResolvedValue({
      id: accountId,
      status: 'CONNECTED',
      scopes: ['user.info.basic', 'video.publish'],
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      credential: {
        platform: 'TIKTOK',
        keyId: 'test-key',
        algorithm: 'aes-256-gcm',
        iv: new Uint8Array(12),
        authTag: new Uint8Array(16),
        ciphertext: new Uint8Array([1]),
      },
    }),
    promote: vi
      .fn()
      .mockResolvedValue({ socialAccountId: 'account-id', destinationId: 'destination-id' }),
  } as unknown as TikTokConnectionsRepository;
  return {
    service: new TikTokConnectionsService(states, cipher, clients, repository, publishingClients),
    states,
    provider,
    publishingProvider,
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

  it('queries creator info with the decrypted server-side publishing token', async () => {
    const { service, cipher, publishingProvider } = setup();
    await expect(
      service.creatorInfo(accountId, new Date('2026-09-30T12:00:00.000Z')),
    ).resolves.toMatchObject({
      privacyLevelOptions: ['SELF_ONLY'],
      maxVideoPostDurationSeconds: 300,
    });
    expect(cipher.decrypt).toHaveBeenCalledOnce();
    expect(publishingProvider.queryCreatorInfo).toHaveBeenCalledWith('publishing-access-token');
  });

  it('fails closed before provider access when the account is expired', async () => {
    const { service, repository, publishingProvider } = setup();
    vi.mocked(repository.findPublishingCredential).mockResolvedValueOnce({
      id: accountId,
      status: 'CONNECTED',
      scopes: ['user.info.basic', 'video.publish'],
      expiresAt: new Date('2026-09-30T11:59:59.000Z'),
      credential: null,
    });

    await expect(
      service.creatorInfo(accountId, new Date('2026-09-30T12:00:00.000Z')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIKTOK_ACCOUNT_RECONNECT_REQUIRED' }),
    });
    expect(publishingProvider.queryCreatorInfo).not.toHaveBeenCalled();
  });

  it('fails closed before decryption when the stored account scope is missing', async () => {
    const { service, repository, cipher } = setup();
    vi.mocked(repository.findPublishingCredential).mockResolvedValueOnce({
      id: accountId,
      status: 'CONNECTED',
      scopes: ['user.info.basic'],
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      credential: null,
    });

    await expect(
      service.creatorInfo(accountId, new Date('2026-09-30T12:00:00.000Z')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIKTOK_PUBLISH_SCOPE_REQUIRED' }),
    });
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it('sanitizes creator-info provider failures', async () => {
    const { service, publishingProvider } = setup();
    vi.mocked(publishingProvider.queryCreatorInfo).mockRejectedValueOnce(
      new TikTokPublishingError('TIKTOK_CREATOR_INFO_FAILED_PROVIDER_ACCESS_TOKEN_INVALID', 401),
    );

    await expect(
      service.creatorInfo(accountId, new Date('2026-09-30T12:00:00.000Z')),
    ).rejects.toMatchObject({
      response: {
        code: 'TIKTOK_CREATOR_INFO_FAILED_PROVIDER_ACCESS_TOKEN_INVALID',
        message: 'TikTok publishing capability request failed',
      },
    });
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
