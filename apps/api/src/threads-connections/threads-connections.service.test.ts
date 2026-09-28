import { BadGatewayException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { ThreadsConnectionClientFactory } from './threads-connection-client.factory.js';
import type { ThreadsConnectionsRepository } from './threads-connections.repository.js';
import { ThreadsConnectionsService } from './threads-connections.service.js';
import type { ThreadsOAuthSessionStore } from './threads-oauth-session.store.js';

const userId = '11111111-1111-4111-8111-111111111111';

function createHarness() {
  const provider = {
    buildAuthorizationUrl: vi.fn().mockReturnValue('https://threads.net/oauth/authorize?state=x'),
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'short-token', userId: '123' }),
    exchangeLongLivedToken: vi.fn().mockResolvedValue({
      accessToken: 'long-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    }),
    getProfile: vi.fn().mockResolvedValue({
      id: '123',
      username: 'recruitops',
      name: 'RecruitOps',
    }),
  };
  const clients = { create: vi.fn().mockReturnValue(provider) };
  const sessions = {
    createPending: vi.fn().mockResolvedValue({ expiresAt: '2026-09-29T01:10:00.000Z' }),
    consumePending: vi.fn().mockResolvedValue({
      userId,
      createdAt: '2026-09-29T01:00:00.000Z',
    }),
  };
  const encryptedCredential = {
    platform: 'THREADS' as const,
    keyId: 'key-1',
    algorithm: 'aes-256-gcm' as const,
    iv: Uint8Array.from([1]),
    authTag: Uint8Array.from([2]),
    ciphertext: Uint8Array.from([3]),
  };
  const cipher = { encrypt: vi.fn().mockReturnValue(encryptedCredential) };
  const repository = {
    promote: vi.fn().mockResolvedValue({
      socialAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      destinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      externalAccountId: '123',
      displayName: 'RecruitOps',
    }),
  };
  const service = new ThreadsConnectionsService(
    clients as unknown as ThreadsConnectionClientFactory,
    sessions as unknown as ThreadsOAuthSessionStore,
    repository as unknown as ThreadsConnectionsRepository,
    cipher as unknown as OAuthCredentialCipher,
  );

  return { service, provider, sessions, cipher, repository, encryptedCredential };
}

describe('ThreadsConnectionsService', () => {
  it('creates one-time state before authorization', async () => {
    const { service, sessions, provider } = createHarness();
    const result = await service.start(userId);

    expect(sessions.createPending).toHaveBeenCalledWith({
      state: expect.any(String),
      userId,
    });
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith(expect.any(String));
    expect(result.authorizationUrl).toContain('threads.net/oauth/authorize');
  });

  it('promotes a verified Threads profile', async () => {
    const { service, cipher, repository, encryptedCredential } = createHarness();
    const result = await service.callback({ code: 'oauth-code', state: 'oauth-state' });

    expect(cipher.encrypt).toHaveBeenCalledWith(
      'THREADS',
      expect.objectContaining({
        accessToken: 'long-token',
        tokenType: 'bearer',
        scopes: ['threads_basic', 'threads_content_publish'],
        expiresAt: expect.any(String),
      }),
    );
    expect(repository.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAccountId: '123',
        displayName: 'RecruitOps',
        scopes: ['threads_basic', 'threads_content_publish'],
        credential: encryptedCredential,
      }),
    );
    expect(result.connectedByUserId).toBe(userId);
  });

  it('rejects expired or replayed state', async () => {
    const { service, sessions, provider } = createHarness();
    sessions.consumePending.mockResolvedValueOnce(null);
    const action = service.callback({ code: 'oauth-code', state: 'expired' });

    await expect(action).rejects.toBeInstanceOf(UnauthorizedException);
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a mismatched Threads profile', async () => {
    const { service, provider, repository } = createHarness();
    provider.getProfile.mockResolvedValueOnce({ id: '999', username: 'other' });
    const action = service.callback({ code: 'oauth-code', state: 'oauth-state' });

    await expect(action).rejects.toBeInstanceOf(BadGatewayException);
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('normalizes provider denial', async () => {
    const { service, provider } = createHarness();
    const action = service.callback({ error: 'access_denied' });

    await expect(action).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });
});
