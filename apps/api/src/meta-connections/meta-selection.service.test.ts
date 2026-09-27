import { describe, expect, it, vi } from 'vitest';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { MetaConnectionClientFactory } from './meta-connection-client.factory.js';
import type { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import type { MetaOAuthSessionStore } from './meta-oauth-session.store.js';

const userId = '11111111-1111-4111-8111-111111111111';
const connectionSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createService(selection: unknown) {
  const sessions = {
    getSelectionForUser: vi.fn().mockResolvedValue(selection),
  };
  const service = new MetaConnectionsService(
    sessions as unknown as MetaOAuthSessionStore,
    {} as OAuthCredentialCipher,
    {} as MetaConnectionClientFactory,
    {} as MetaConnectionsRepository,
  );
  return { service, sessions };
}

describe('MetaConnectionsService.getSelection', () => {
  it('returns only non-secret account metadata from the user-bound selection session', async () => {
    const { service, sessions } = createService({
      userId,
      targets: ['FACEBOOK', 'INSTAGRAM'],
      encryptedUserToken: {
        platform: 'FACEBOOK',
        keyId: 'key-1',
        algorithm: 'aes-256-gcm',
        iv: Uint8Array.from([1]),
        authTag: Uint8Array.from([2]),
        ciphertext: Uint8Array.from([3]),
      },
      accounts: [
        {
          pageId: '123',
          pageName: 'RecruitOps Page',
          tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
          instagramProfessionalAccount: {
            id: '456',
            username: 'recruitops',
            name: 'RecruitOps',
          },
        },
      ],
      createdAt: '2026-09-28T12:00:00.000Z',
      expiresAt: '2026-09-28T12:15:00.000Z',
    });

    const result = await service.getSelection(userId, { connectionSessionId });

    expect(sessions.getSelectionForUser).toHaveBeenCalledWith(connectionSessionId, userId);
    expect(result).toEqual({
      connectionSessionId,
      expiresAt: '2026-09-28T12:15:00.000Z',
      targets: ['FACEBOOK', 'INSTAGRAM'],
      accounts: [
        {
          pageId: '123',
          pageName: 'RecruitOps Page',
          tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
          instagramProfessionalAccount: {
            id: '456',
            username: 'recruitops',
            name: 'RecruitOps',
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('encryptedUserToken');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('fails closed for an expired, unknown, or other-user selection session', async () => {
    const { service } = createService(null);

    await expect(service.getSelection(userId, { connectionSessionId })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_OAUTH_SELECTION_INVALID_OR_EXPIRED' }),
    });
  });
});
