import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaConnectionError } from '@recruitops/integrations';
import type { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import type { MetaConnectionClientFactory } from './meta-connection-client.factory.js';
import type { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import type { MetaOAuthSessionStore } from './meta-oauth-session.store.js';

const userId = '11111111-1111-4111-8111-111111111111';
const validState = 's'.repeat(43);
const connectionSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function encrypted(platform: 'FACEBOOK' | 'INSTAGRAM') {
  return {
    platform,
    keyId: 'key-1',
    algorithm: 'aes-256-gcm' as const,
    iv: Uint8Array.from([1]),
    authTag: Uint8Array.from([2]),
    ciphertext: Uint8Array.from([3]),
  };
}

function createHarness() {
  const sessions = {
    createPending: vi.fn().mockResolvedValue({ expiresAt: '2026-09-28T12:10:00.000Z' }),
    consumePending: vi.fn().mockResolvedValue({
      userId,
      targets: ['FACEBOOK'],
      createdAt: '2026-09-28T12:00:00.000Z',
    }),
    createSelection: vi.fn().mockResolvedValue({
      connectionSessionId,
      expiresAt: '2026-09-28T12:15:00.000Z',
    }),
    getSelectionForUser: vi.fn().mockResolvedValue({
      userId,
      targets: ['FACEBOOK'],
      encryptedUserToken: encrypted('FACEBOOK'),
      accounts: [
        {
          pageId: '123',
          pageName: 'RecruitOps Page',
          tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
          instagramProfessionalAccount: null,
        },
      ],
      createdAt: '2026-09-28T12:00:00.000Z',
      expiresAt: '2026-09-28T12:15:00.000Z',
    }),
    deleteSelection: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    buildAuthorizationUrl: vi.fn().mockReturnValue('https://www.facebook.com/oauth'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: 'short-user-token',
      tokenType: 'bearer',
      expiresInSeconds: 3_600,
    }),
    exchangeLongLivedUserToken: vi.fn().mockResolvedValue({
      accessToken: 'long-user-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    }),
    listManagedPages: vi.fn().mockResolvedValue([
      {
        id: '123',
        name: 'RecruitOps Page',
        accessToken: 'page-access-token',
        tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
      },
    ]),
    discoverAccounts: vi.fn().mockResolvedValue([]),
  };
  const clients = {
    create: vi.fn().mockReturnValue(provider),
  };
  const cipher = {
    encrypt: vi
      .fn()
      .mockImplementation((platform: 'FACEBOOK' | 'INSTAGRAM') => encrypted(platform)),
    decrypt: vi.fn().mockReturnValue({
      accessToken: 'long-user-token',
      tokenType: 'bearer',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    }),
  };
  const repository = {
    promote: vi.fn().mockResolvedValue([
      {
        socialAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        destinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        platform: 'FACEBOOK',
        externalAccountId: '123',
        displayName: 'RecruitOps Page',
      },
    ]),
  };
  const service = new MetaConnectionsService(
    sessions as unknown as MetaOAuthSessionStore,
    cipher as unknown as OAuthCredentialCipher,
    clients as unknown as MetaConnectionClientFactory,
    repository as unknown as MetaConnectionsRepository,
  );

  return { service, sessions, provider, clients, cipher, repository };
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
});

describe('MetaConnectionsService', () => {
  it('creates a strong one-time state before returning the authorization URL', async () => {
    const { service, sessions, provider } = createHarness();

    await expect(service.start(userId, { targets: ['FACEBOOK'] })).resolves.toEqual({
      authorizationUrl: 'https://www.facebook.com/oauth',
      expiresAt: '2026-09-28T12:10:00.000Z',
    });

    const state = sessions.createPending.mock.calls[0]![0].state as string;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessions.createPending).toHaveBeenCalledWith({
      state,
      userId,
      targets: ['FACEBOOK'],
    });
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith({
      state,
      targets: ['FACEBOOK'],
    });
  });

  it('consumes state, stores only an encrypted user token, and returns no provider tokens', async () => {
    const { service, sessions, provider, cipher } = createHarness();

    const result = await service.callback({
      state: validState,
      code: 'authorization-code',
    });

    expect(sessions.consumePending).toHaveBeenCalledWith(validState);
    expect(provider.listManagedPages).toHaveBeenCalledWith('long-user-token');
    expect(provider.discoverAccounts).not.toHaveBeenCalled();
    expect(cipher.encrypt).toHaveBeenCalledWith(
      'FACEBOOK',
      expect.objectContaining({
        accessToken: 'long-user-token',
        scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
      }),
    );
    expect(sessions.createSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        targets: ['FACEBOOK'],
        accounts: [
          {
            pageId: '123',
            pageName: 'RecruitOps Page',
            tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
            instagramProfessionalAccount: null,
          },
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('long-user-token');
    expect(JSON.stringify(result)).not.toContain('page-access-token');
  });

  it('uses Instagram discovery only when Instagram was requested', async () => {
    const { service, sessions, provider } = createHarness();
    sessions.consumePending.mockResolvedValue({
      userId,
      targets: ['INSTAGRAM'],
      createdAt: '2026-09-28T12:00:00.000Z',
    });
    provider.discoverAccounts.mockResolvedValue([
      {
        id: '123',
        name: 'RecruitOps Page',
        accessToken: 'page-access-token',
        tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
        instagramProfessionalAccount: {
          id: '456',
          username: 'recruitops',
          name: 'RecruitOps',
        },
      },
    ]);

    const result = await service.callback({ state: validState, code: 'authorization-code' });

    expect(provider.discoverAccounts).toHaveBeenCalledWith('long-user-token');
    expect(provider.listManagedPages).not.toHaveBeenCalled();
    expect(result.accounts[0]).toMatchObject({
      pageId: '123',
      instagramProfessionalAccount: { id: '456', username: 'recruitops' },
    });
  });

  it('promotes only the explicitly selected Facebook Page with a rediscovered Page token', async () => {
    const { service, sessions, provider, cipher, repository } = createHarness();

    const result = await service.select(userId, {
      connectionSessionId,
      accounts: [{ platform: 'FACEBOOK', pageId: '123' }],
    });

    expect(sessions.getSelectionForUser).toHaveBeenCalledWith(connectionSessionId, userId);
    expect(cipher.decrypt).toHaveBeenCalledWith(encrypted('FACEBOOK'));
    expect(provider.listManagedPages).toHaveBeenCalledWith('long-user-token');
    expect(cipher.encrypt).toHaveBeenCalledWith(
      'FACEBOOK',
      expect.objectContaining({
        accessToken: 'page-access-token',
        scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
      }),
    );
    expect(repository.promote).toHaveBeenCalledWith([
      expect.objectContaining({
        platform: 'FACEBOOK',
        externalAccountId: '123',
        destinationType: 'PAGE',
        destinationExternalId: '123',
      }),
    ]);
    expect(sessions.deleteSelection).toHaveBeenCalledWith(connectionSessionId);
    expect(JSON.stringify(result)).not.toContain('page-access-token');
    expect(JSON.stringify(result)).not.toContain('long-user-token');
  });

  it('promotes a selected Instagram Professional account using its linked Page token', async () => {
    const { service, sessions, provider, cipher, repository } = createHarness();
    sessions.getSelectionForUser.mockResolvedValue({
      userId,
      targets: ['INSTAGRAM'],
      encryptedUserToken: encrypted('FACEBOOK'),
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
    provider.discoverAccounts.mockResolvedValue([
      {
        id: '123',
        name: 'RecruitOps Page',
        accessToken: 'fresh-page-access-token',
        tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
        instagramProfessionalAccount: {
          id: '456',
          username: 'recruitops',
          name: 'RecruitOps',
        },
      },
    ]);

    await service.select(userId, {
      connectionSessionId,
      accounts: [{ platform: 'INSTAGRAM', pageId: '123', instagramAccountId: '456' }],
    });

    expect(provider.discoverAccounts).toHaveBeenCalledWith('long-user-token');
    expect(cipher.encrypt).toHaveBeenCalledWith(
      'INSTAGRAM',
      expect.objectContaining({
        accessToken: 'fresh-page-access-token',
        scopes: [
          'pages_show_list',
          'pages_read_engagement',
          'instagram_basic',
          'instagram_content_publish',
        ],
      }),
    );
    expect(repository.promote).toHaveBeenCalledWith([
      expect.objectContaining({
        platform: 'INSTAGRAM',
        externalAccountId: '456',
        destinationType: 'PROFILE',
        destinationExternalId: '456',
      }),
    ]);
  });

  it('rejects selections that were not discovered in the authenticated session', async () => {
    const { service, provider, repository } = createHarness();

    await expect(
      service.select(userId, {
        connectionSessionId,
        accounts: [{ platform: 'FACEBOOK', pageId: '999' }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_ACCOUNT_SELECTION_NOT_DISCOVERED' }),
    });
    expect(provider.listManagedPages).not.toHaveBeenCalled();
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it('keeps the selection session when provider promotion fails so the user can retry', async () => {
    const { service, provider, sessions } = createHarness();
    provider.listManagedPages.mockRejectedValue(
      new MetaConnectionError('META_PAGE_DISCOVERY_FAILED_PROVIDER_190', 400),
    );

    await expect(
      service.select(userId, {
        connectionSessionId,
        accounts: [{ platform: 'FACEBOOK', pageId: '123' }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_PAGE_DISCOVERY_FAILED_PROVIDER_190' }),
    });
    expect(sessions.deleteSelection).not.toHaveBeenCalled();
  });

  it('rejects replayed, expired, or unknown state before contacting Meta', async () => {
    const { service, sessions, clients } = createHarness();
    sessions.consumePending.mockResolvedValue(null);

    await expect(
      service.callback({ state: validState, code: 'authorization-code' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_OAUTH_STATE_INVALID_OR_EXPIRED' }),
    });
    expect(clients.create).not.toHaveBeenCalled();
  });

  it('consumes denied callbacks without copying provider error descriptions', async () => {
    const { service, clients } = createHarness();

    await expect(
      service.callback({
        state: validState,
        error: 'access_denied',
        error_description: 'provider text that must not be copied',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_OAUTH_DENIED' }),
    });
    expect(clients.create).not.toHaveBeenCalled();
  });

  it('normalizes provider failures after state validation', async () => {
    const { service, provider } = createHarness();
    provider.exchangeAuthorizationCode.mockRejectedValue(
      new MetaConnectionError('META_TOKEN_EXCHANGE_FAILED_PROVIDER_190', 400),
    );

    await expect(
      service.callback({ state: validState, code: 'authorization-code' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_TOKEN_EXCHANGE_FAILED_PROVIDER_190' }),
    });
  });
});
