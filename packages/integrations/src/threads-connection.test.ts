import { describe, expect, it, vi } from 'vitest';
import {
  THREADS_CONNECTION_SCOPES,
  ThreadsConnectionProvider,
  ThreadsConnectionProviderError,
} from './threads-connection.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ThreadsConnectionProvider', () => {
  it('builds a least-privilege authorization URL with caller state', () => {
    const provider = new ThreadsConnectionProvider({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://example.com/api/integrations/threads/oauth/callback',
      fetchImpl: vi.fn(),
    });

    const url = new URL(provider.buildAuthorizationUrl('state-value'));
    expect(url.origin + url.pathname).toBe('https://threads.net/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.com/api/integrations/threads/oauth/callback',
    );
    expect(url.searchParams.get('scope')).toBe(THREADS_CONNECTION_SCOPES.join(','));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-value');
  });

  it('exchanges a code without exposing the app secret in the URL', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://graph.threads.net/oauth/access_token');
      expect(init?.method).toBe('POST');
      const body = init?.body as URLSearchParams;
      expect(body.get('client_secret')).toBe('app-secret');
      expect(body.get('code')).toBe('oauth-code');
      return jsonResponse({ access_token: 'short-token', user_id: '123' });
    });
    const provider = new ThreadsConnectionProvider({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://example.com/callback',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(provider.exchangeCode('oauth-code')).resolves.toEqual({
      accessToken: 'short-token',
      userId: '123',
    });
  });

  it('exchanges for a long-lived token and retrieves the app-scoped profile', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'long-token', token_type: 'bearer', expires_in: 5_184_000 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: '123', username: 'recruitops', name: 'RecruitOps' }),
      );
    const provider = new ThreadsConnectionProvider({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://example.com/callback',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(provider.exchangeLongLivedToken('short-token')).resolves.toEqual({
      accessToken: 'long-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    });
    await expect(provider.getProfile('long-token')).resolves.toEqual({
      id: '123',
      username: 'recruitops',
      name: 'RecruitOps',
    });

    const exchangeUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(exchangeUrl.searchParams.has('access_token')).toBe(false);
    const exchangeInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(exchangeInit.headers).toEqual({ Authorization: 'Bearer short-token' });

    const profileInit = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(profileInit.headers).toEqual({ Authorization: 'Bearer long-token' });
  });

  it('normalizes provider failures without copying response text', async () => {
    const provider = new ThreadsConnectionProvider({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://example.com/callback',
      fetchImpl: vi.fn(async () => jsonResponse({ error_message: 'provider secret details' }, 400)),
    });

    await expect(provider.exchangeCode('bad-code')).rejects.toEqual(
      new ThreadsConnectionProviderError('THREADS_OAUTH_CODE_EXCHANGE_FAILED'),
    );
  });
});
