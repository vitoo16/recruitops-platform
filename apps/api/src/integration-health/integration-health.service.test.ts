import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationHealthRepository } from './integration-health.repository.js';
import { IntegrationHealthService } from './integration-health.service.js';

const now = new Date('2026-09-28T00:00:00.000Z');

function configureRuntime() {
  vi.stubEnv('META_CLIENT_ID', 'meta-client');
  vi.stubEnv('META_CLIENT_SECRET', 'meta-secret');
  vi.stubEnv('META_GRAPH_API_VERSION', 'v26.0');
  vi.stubEnv('META_REDIRECT_URI', 'https://api.example.com/api/integrations/meta/oauth/callback');
  vi.stubEnv('META_FRONTEND_REDIRECT_URI', 'https://app.example.com');
  vi.stubEnv('OAUTH_CREDENTIAL_ACTIVE_KEY_ID', 'key-1');
  vi.stubEnv(
    'OAUTH_CREDENTIAL_ENCRYPTION_KEYS',
    JSON.stringify({ 'key-1': Buffer.alloc(32, 1).toString('base64') }),
  );
}

function harness(accounts: Awaited<ReturnType<IntegrationHealthRepository['listMetaAccounts']>>) {
  const repository = {
    listMetaAccounts: vi.fn().mockResolvedValue(accounts),
  };
  const service = new IntegrationHealthService(
    repository as unknown as IntegrationHealthRepository,
  );
  return { service, repository };
}

beforeEach(() => {
  configureRuntime();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IntegrationHealthService', () => {
  it('reports a configured provider with no accounts as disconnected', async () => {
    const { service } = harness([]);

    await expect(service.getHealth(now)).resolves.toEqual({
      meta: {
        provider: 'META',
        configured: true,
        status: 'DISCONNECTED',
        accounts: [],
      },
    });
  });

  it('reports connected accounts as healthy without exposing credential data', async () => {
    const { service } = harness([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: 'FACEBOOK',
        displayName: 'RecruitOps Page',
        status: 'CONNECTED',
        expiresAt: new Date('2026-10-28T00:00:00.000Z'),
        hasCredential: true,
      },
    ]);

    const result = await service.getHealth(now);

    expect(result.meta.status).toBe('HEALTHY');
    expect(result.meta.accounts[0]).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      platform: 'FACEBOOK',
      displayName: 'RecruitOps Page',
      status: 'CONNECTED',
      expiresAt: '2026-10-28T00:00:00.000Z',
      requiresReconnect: false,
    });
    expect(JSON.stringify(result)).not.toContain('credentialRef');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('requires reconnect when a connected credential has passed its expiry time', async () => {
    const { service } = harness([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: 'INSTAGRAM',
        displayName: 'RecruitOps IG',
        status: 'CONNECTED',
        expiresAt: new Date('2026-09-27T23:59:59.000Z'),
        hasCredential: true,
      },
    ]);

    const result = await service.getHealth(now);

    expect(result.meta.status).toBe('RECONNECT_REQUIRED');
    expect(result.meta.accounts[0]).toMatchObject({
      requiresReconnect: true,
      reconnectReason: 'EXPIRED',
    });
  });

  it.each([
    ['EXPIRED', true, 'EXPIRED'],
    ['REVOKED', true, 'REVOKED'],
    ['ERROR', true, 'ERROR'],
    ['CONNECTED', false, 'MISSING_CREDENTIAL'],
  ] as const)(
    'maps account state %s with credential=%s to reconnect reason %s',
    async (status, hasCredential, expectedReason) => {
      const { service } = harness([
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          platform: 'FACEBOOK',
          displayName: 'RecruitOps Page',
          status,
          expiresAt: null,
          hasCredential,
        },
      ]);

      const result = await service.getHealth(now);

      expect(result.meta.status).toBe('RECONNECT_REQUIRED');
      expect(result.meta.accounts[0]?.reconnectReason).toBe(expectedReason);
    },
  );

  it('reports not configured when Meta or encryption runtime config is incomplete', async () => {
    vi.stubEnv('OAUTH_CREDENTIAL_ENCRYPTION_KEYS', '');
    const { service } = harness([]);

    const result = await service.getHealth(now);

    expect(result.meta.configured).toBe(false);
    expect(result.meta.status).toBe('NOT_CONFIGURED');
  });
});
