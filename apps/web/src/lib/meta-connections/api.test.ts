import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmMetaSelection,
  getIntegrationHealth,
  getMetaSelection,
  startMetaConnection,
} from './api';

const apiUrl = 'https://api.example.com/api';
const accessToken = 'supabase-access-token';
const connectionSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Meta connection frontend API client', () => {
  it('loads typed integration health with bearer auth and no credential material', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        meta: {
          provider: 'META',
          configured: true,
          status: 'RECONNECT_REQUIRED',
          accounts: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              platform: 'FACEBOOK',
              displayName: 'RecruitOps Page',
              status: 'EXPIRED',
              requiresReconnect: true,
              reconnectReason: 'EXPIRED',
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getIntegrationHealth(apiUrl, accessToken);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/integrations/health`);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${accessToken}`);
    expect(result.meta.status).toBe('RECONNECT_REQUIRED');
    expect(JSON.stringify(result)).not.toContain('credentialRef');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('starts authorization with bearer auth and explicit targets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        authorizationUrl: 'https://www.facebook.com/dialog/oauth?state=opaque',
        expiresAt: '2026-09-28T12:10:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startMetaConnection(apiUrl, accessToken, ['FACEBOOK', 'INSTAGRAM']),
    ).resolves.toMatchObject({
      authorizationUrl: 'https://www.facebook.com/dialog/oauth?state=opaque',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/integrations/meta/oauth/start`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${accessToken}`);
    expect(JSON.parse(String(init.body))).toEqual({ targets: ['FACEBOOK', 'INSTAGRAM'] });
  });

  it('loads only non-secret selection metadata from the authenticated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        connectionSessionId,
        expiresAt: '2026-09-28T12:15:00.000Z',
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
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMetaSelection(apiUrl, accessToken, connectionSessionId);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiUrl}/integrations/meta/oauth/selection/${connectionSessionId}`,
    );
    expect(JSON.stringify(result)).not.toContain('accessToken');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('confirms only explicitly selected accounts without exposing provider credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        connected: [
          {
            socialAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            destinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            platform: 'FACEBOOK',
            externalAccountId: '123',
            displayName: 'RecruitOps Page',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await confirmMetaSelection(apiUrl, accessToken, connectionSessionId, [
      { platform: 'FACEBOOK', pageId: '123' },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/integrations/meta/oauth/select`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      connectionSessionId,
      accounts: [{ platform: 'FACEBOOK', pageId: '123' }],
    });
    expect(JSON.stringify(result)).not.toContain('accessToken');
  });

  it('rejects malformed provider-facing API payloads instead of trusting raw JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ authorizationUrl: 'not-a-url' })),
    );

    await expect(startMetaConnection(apiUrl, accessToken, ['FACEBOOK'])).rejects.toThrow();
  });
});
