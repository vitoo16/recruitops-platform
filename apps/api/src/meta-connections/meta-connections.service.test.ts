import type { AuditService } from '../audit/audit.service.js';
import type { OAuthCredentialStore } from '../social-credentials/oauth-credential-store.js';
import type { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import type { MetaOAuthStateService } from './meta-oauth-state.js';
import type { MetaProviderService } from './meta-provider.service.js';
import { describe, expect, it, vi } from 'vitest';

function createService(input: { grantedPermissions?: string[]; pages?: unknown[] }) {
  const provider = {
    authorizationUrl: vi.fn().mockReturnValue('https://www.facebook.com/v26.0/dialog/oauth'),
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'user-token' }),
    grantedPermissions: vi.fn().mockResolvedValue(
      input.grantedPermissions ?? [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
      ],
    ),
    managedPages: vi.fn().mockResolvedValue(
      input.pages ?? [
        {
          id: 'page-id',
          name: 'RecruitOps Page',
          accessToken: 'page-secret',
          tasks: ['CREATE_CONTENT'],
          instagramBusinessAccount: { id: 'ig-id', username: 'recruitops' },
        },
      ],
    ),
  };
  const states = {
    issue: vi.fn().mockReturnValue({
      state: 'signed-state',
      expiresAt: '2026-09-28T00:10:00.000Z',
    }),
    verify: vi.fn().mockReturnValue({ actorId: '550e8400-e29b-41d4-a716-446655440000' }),
  };
  const accounts = new Map<string, Record<string, unknown>>();
  let sequence = 0;
  const repository = {
    upsertPendingAccount: vi.fn().mockImplementation(async (account) => {
      const pending = {
        id: `account-${++sequence}`,
        ...account,
        status: 'ERROR',
        expiresAt: null,
      };
      accounts.set(pending.id, pending);
      return pending;
    }),
    markConnected: vi.fn().mockImplementation(async (id: string) => ({
      ...accounts.get(id),
      id,
      status: 'CONNECTED',
      expiresAt: null,
    })),
  };
  const credentials = { save: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn() };

  const service = new MetaConnectionsService(
    provider as unknown as MetaProviderService,
    states as unknown as MetaOAuthStateService,
    repository as unknown as MetaConnectionsRepository,
    credentials as unknown as OAuthCredentialStore,
    audit as unknown as AuditService,
  );
  return { service, provider, states, repository, credentials, audit };
}

describe('MetaConnectionsService', () => {
  it('creates an authorization URL for an authenticated owner/admin actor', () => {
    const { service, provider, states } = createService({});
    expect(
      service.start({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'owner@example.com',
        role: 'OWNER',
      }),
    ).toEqual({
      authorizationUrl: 'https://www.facebook.com/v26.0/dialog/oauth',
      expiresAt: '2026-09-28T00:10:00.000Z',
    });
    expect(states.issue).toHaveBeenCalled();
    expect(provider.authorizationUrl).toHaveBeenCalledWith('signed-state');
  });

  it('persists Page and linked Instagram credentials without returning token material', async () => {
    const { service, credentials } = createService({});
    const result = await service.complete({ code: 'oauth-code', state: 'signed-state' });

    expect(result.connectedAccounts).toHaveLength(2);
    expect(result.connectedAccounts.map((account) => account.platform)).toEqual([
      'FACEBOOK',
      'INSTAGRAM',
    ]);
    expect(credentials.save).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('page-secret');
    expect(JSON.stringify(result)).not.toContain('user-token');
  });

  it('fails closed when required Page permissions are missing', async () => {
    const { service, credentials } = createService({
      grantedPermissions: ['pages_show_list', 'pages_read_engagement'],
    });

    await expect(
      service.complete({ code: 'oauth-code', state: 'signed-state' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'META_PAGE_PERMISSIONS_MISSING' }),
    });
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('connects Facebook Pages but warns instead of fabricating Instagram access when IG scopes are absent', async () => {
    const { service, credentials } = createService({
      grantedPermissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    });

    const result = await service.complete({ code: 'oauth-code', state: 'signed-state' });
    expect(result.connectedAccounts.map((account) => account.platform)).toEqual(['FACEBOOK']);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'META_INSTAGRAM_PERMISSIONS_MISSING' }),
    ]);
    expect(credentials.save).toHaveBeenCalledTimes(1);
  });

  it('does not warn about Instagram permissions when no linked Instagram account exists', async () => {
    const { service } = createService({
      grantedPermissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
      pages: [
        {
          id: 'page-id',
          name: 'RecruitOps Page',
          accessToken: 'page-secret',
          tasks: ['CREATE_CONTENT'],
        },
      ],
    });

    const result = await service.complete({ code: 'oauth-code', state: 'signed-state' });
    expect(result.warnings).toEqual([]);
  });
});
