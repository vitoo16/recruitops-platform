import { describe, expect, it, vi } from 'vitest';
import {
  ThreadsConnectionError,
  ThreadsConnectionProvider,
  threadsPublishingConnectionScopes,
} from './threads-connection.js';

const config = {
  appId: '123456789',
  appSecret: 'server-only-secret',
  redirectUri: 'https://recruitops.example.com/integrations/threads/callback',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ThreadsConnectionProvider', () => {
  it('uses the least-privilege publishing scopes', () => {
    expect(threadsPublishingConnectionScopes).toEqual(['threads_basic', 'threads_content_publish']);
  });

  it('builds the official authorization URL with strong caller state and no app secret', () => {
    const provider = new ThreadsConnectionProvider(config, vi.fn() as unknown as typeof fetch);
    const url = new URL(
      provider.buildAuthorizationUrl('state-value-that-is-long-enough-for-csrf-defense'),
    );

    expect(url.origin).toBe('https://threads.net');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(config.appId);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.toString()).not.toContain(config.appSecret);
    expect(() => provider.buildAuthorizationUrl('short')).toThrow('THREADS_OAUTH_STATE_INVALID');
  });

  it('exchanges an authorization code using a form body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'short-token', user_id: '12345' }));
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.exchangeAuthorizationCode('authorization-code')).resolves.toEqual({
      accessToken: 'short-token',
      userId: '12345',
    });

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://graph.threads.net/oauth/access_token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(String(init.body)).toContain('client_secret=server-only-secret');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(url.toString()).not.toContain(config.appSecret);
  });

  it('exchanges a short-lived token without placing the token in the URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: 'long-token',
        token_type: 'bearer',
        expires_in: 5_184_000,
      }),
    );
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.exchangeLongLivedToken('short-token')).resolves.toEqual({
      accessToken: 'long-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    });

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get('grant_type')).toBe('th_exchange_token');
    expect(url.searchParams.get('client_secret')).toBe(config.appSecret);
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(init.headers).toEqual({ authorization: 'Bearer short-token' });
  });

  it('refreshes a long-lived token with bearer auth and no token query parameter', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: 'refreshed-token',
        token_type: 'bearer',
        expires_in: 5_184_000,
      }),
    );
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.refreshLongLivedToken('long-token')).resolves.toEqual({
      accessToken: 'refreshed-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    });

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe('https://graph.threads.net');
    expect(url.pathname).toBe('/refresh_access_token');
    expect(url.searchParams.get('grant_type')).toBe('th_refresh_token');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(init.headers).toEqual({ authorization: 'Bearer long-token' });
  });

  it('fails closed when a refresh response does not contain a token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}));
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.refreshLongLivedToken('long-token')).rejects.toMatchObject({
      name: 'ThreadsConnectionError',
      code: 'THREADS_TOKEN_REFRESH_RESPONSE_INVALID',
    });
  });

  it('retrieves the app-scoped Threads profile with bearer auth', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '12345', username: 'recruitops', name: 'RecruitOps' }));
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.getProfile('long-token')).resolves.toEqual({
      id: '12345',
      username: 'recruitops',
      name: 'RecruitOps',
    });

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe('https://graph.threads.net');
    expect(url.pathname).toBe('/me');
    expect(url.searchParams.get('fields')).toBe('id,username,name');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(init.headers).toEqual({ authorization: 'Bearer long-token' });
  });

  it('normalizes provider failures without leaking the provider response body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { code: 190, message: 'provider-secret-detail' } }, 401),
      );
    const provider = new ThreadsConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.getProfile('bad-token')).rejects.toMatchObject({
      name: 'ThreadsConnectionError',
      code: 'THREADS_PROFILE_FAILED_PROVIDER_190',
      status: 401,
    });
  });

  it('rejects insecure non-local redirect URIs', () => {
    expect(
      () =>
        new ThreadsConnectionProvider({
          ...config,
          redirectUri: 'http://example.com/callback',
        }),
    ).toThrow(ThreadsConnectionError);
  });
});
