import { BadRequestException } from '@nestjs/common';
import type { LinkedInConnectionProvider } from '@recruitops/integrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { LinkedInConnectionClientFactory } from './linkedin-connection-client.factory.js';
import type { LinkedInConnectionsRepository } from './linkedin-connections.repository.js';
import { LinkedInConnectionsService } from './linkedin-connections.service.js';
import type { LinkedInOAuthStateStore } from './linkedin-oauth-state.store.js';

const userId = '2ca934f4-8e91-4c9f-a64b-04f7cf992f88';
const state = 'a'.repeat(43);
const originalActiveKeyId = process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID;
const originalKeyring = process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS;

function encryptedCredential() {
  return {
    platform: 'LINKEDIN' as const,
    keyId: 'test-key',
    algorithm: 'aes-256-gcm' as const,
    iv: new Uint8Array(12),
    authTag: new Uint8Array(16),
    ciphertext: new Uint8Array([1, 2, 3]),
  };
}

function setup(options?: { scope?: string }) {
  const provider = {
    buildAuthorizationUrl: vi.fn().mockReturnValue('https://www.linkedin.com/oauth/v2/authorization'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: 'member-token',
      expiresInSeconds: 3_600,
      ...(options?.scope === undefined ? {} : { scope: options.scope }),
    }),
    getProfile: vi.fn().mockResolvedValue({ subject: 'member-subject', name: 'Recruiter Name' }),
  } as unknown as LinkedInConnectionProvider;
  const states = {
    create: vi.fn().mockResolvedValue({ expiresAt: '2026-09-30T04:00:00.000Z' }),
    consume: vi.fn().mockResolvedValue({ userId, createdAt: '2026-09-30T03:50:00.000Z' }),
  } as unknown as LinkedInOAuthStateStore;
  const cipher = {
    encrypt: vi.fn().mockReturnValue(encryptedCredential()),
  } as unknown as OAuthCredentialCipher;
  const clients = {
    create: vi.fn().mockReturnValue(provider),
  } as unknown as LinkedInConnectionClientFactory;
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    promote: vi.fn().mockResolvedValue({
      socialAccountId: '7f953cd4-860b-47c3-99b0-1df9868785a5',
      destinationId: '6307f821-a3e4-483c-b859-5437ebd94599',
      externalAccountId: 'member-subject',
      displayName: 'Recruiter Name',
      expiresAt: '2026-09-30T05:00:00.000Z',
    }),
  } as unknown as LinkedInConnectionsRepository;

  return {
    service: new LinkedInConnectionsService(states, cipher, clients, repository),
    provider,
    states,
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
  if (originalActiveKeyId === undefined) delete process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID;
  else process.env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID = originalActiveKeyId;
  if (originalKeyring === undefined) delete process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS;
  else process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS = originalKeyring;
  vi.restoreAllMocks();
});

describe('LinkedInConnectionsService', () => {
  it('creates one-time state before returning the provider authorization URL', async () => {
    const { service, states, provider } = setup();

    await expect(service.start(userId)).resolves.toEqual({
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      expiresAt: '2026-09-30T04:00:00.000Z',
    });
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledOnce();
    expect(states.create).toHaveBeenCalledWith({
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      userId,
    });
  });

  it('promotes an encrypted member credential after consuming state', async () => {
    const { service, states, cipher, repository } = setup({
      scope: 'openid profile w_member_social',
    });

    const result = await service.callback({ state, code: 'authorization-code' });

    expect(states.consume).toHaveBeenCalledWith(state);
    expect(cipher.encrypt).toHaveBeenCalledWith(
      'LINKEDIN',
      expect.objectContaining({
        accessToken: 'member-token',
        tokenType: 'Bearer',
        scopes: ['openid', 'profile', 'w_member_social'],
      }),
    );
    expect(repository.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAccountId: 'member-subject',
        displayName: 'Recruiter Name',
        scopes: ['openid', 'profile', 'w_member_social'],
      }),
    );
    expect(result.initiatedByUserId).toBe(userId);
  });

  it('fails closed if LinkedIn reports a granted scope set without publishing permission', async () => {
    const { service, repository } = setup({ scope: 'openid profile' });

    await expect(service.callback({ state, code: 'authorization-code' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LINKEDIN_OAUTH_REQUIRED_SCOPE_MISSING' }),
    });
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('consumes state before returning an authorization-denied error', async () => {
    const { service, states } = setup();

    await expect(service.callback({ state, error: 'user_cancelled_authorize' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(states.consume).toHaveBeenCalledWith(state);
  });

  it('rejects replayed or expired state before contacting LinkedIn', async () => {
    const { service, states, provider } = setup();
    vi.mocked(states.consume).mockResolvedValueOnce(null);

    await expect(service.callback({ state, code: 'authorization-code' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LINKEDIN_OAUTH_STATE_INVALID_OR_EXPIRED' }),
    });
    expect(provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });
});
