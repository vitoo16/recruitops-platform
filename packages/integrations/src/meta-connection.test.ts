import { describe, expect, it, vi } from 'vitest';
import {
  MetaConnectionError,
  MetaConnectionProvider,
  buildMetaConnectionScopes,
} from './meta-connection.js';

const config = {
  appId: '123456789',
  appSecret: 'server-only-secret',
  graphApiVersion: 'v26.0',
  redirectUri: 'https://recruitops.example.com/integrations/meta/callback',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MetaConnectionProvider', () => {
  it('builds least-privilege scopes for each supported target', () => {
    expect(buildMetaConnectionScopes(['FACEBOOK'])).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ]);
    expect(buildMetaConnectionScopes(['INSTAGRAM'])).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
    ]);
    expect(buildMetaConnectionScopes(['FACEBOOK', 'INSTAGRAM'])).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
    ]);
  });

  it(
    'requires a strong caller-supplied OAuth state and never places the app secret in the authorization URL',
    () => {
      const provider = new MetaConnectionProvider(config, vi.fn() as unknown as typeof fetch);
      const url = new URL(
        provider.buildAuthorizationUrl({
          state: 'state-value-that-is-long-enough-for-csrf-defense',
          targets: ['FACEBOOK', 'INSTAGRAM'],
        }),
      );

      expect(url.origin).toBe('https://www.facebook.com');
      expect(url.pathname).toBe('/v26.0/dialog/oauth');
      expect(url.searchParams.get('client_id')).toBe(config.appId);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe(
        'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
      );
      expect(url.toString()).not.toContain(config.appSecret);
      expect(() =>
        provider.buildAuthorizationUrl({ state: 'short', targets: ['FACEBOOK'] }),
      ).toThrow('META_OAUTH_STATE_INVALID');
    },
  );

  it(
    'exchanges an authorization code using a form body rather than a secret-bearing query string',
    async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: 'short-user-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      );
      const provider = new MetaConnectionProvider(config, fetchFn as unknown as typeof fetch);

      await expect(provider.exchangeAuthorizationCode('authorization-code')).resolves.toEqual({
        accessToken: 'short-user-token',
        tokenType: 'bearer',
        expiresInSeconds: 3600,
      });

      const [rawUrl, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
      expect(rawUrl.search).toBe('');
      expect(init.method).toBe('POST');
      expect(String(init.body)).toContain('client_secret=server-only-secret');
      expect(String(init.body)).not.toContain('short-user-token');
    },
  );

  it('exchanges a short-lived user token for a long-lived token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: 'long-user-token',
        token_type: 'bearer',
        expires_in: 5_184_000,
      }),
    );
    const provider = new MetaConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.exchangeLongLivedUserToken('short-user-token')).resolves.toEqual({
      accessToken: 'long-user-token',
      tokenType: 'bearer',
      expiresInSeconds: 5_184_000,
    });

    const [, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(String(init.body)).toContain('grant_type=fb_exchange_token');
    expect(String(init.body)).toContain('fb_exchange_token=short-user-token');
  });

  it(
    'discovers managed Pages with bearer auth and follows cursors without following provider next URLs',
    async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              {
                id: '111',
                name: 'RecruitOps One',
                access_token: 'page-token-1',
                tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
              },
            ],
            paging: {
              cursors: { after: 'cursor-2' },
              next: 'https://example.invalid/leaky-next',
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              {
                id: '222',
                name: 'RecruitOps Two',
                access_token: 'page-token-2',
                tasks: ['PROFILE_PLUS_FULL_CONTROL'],
              },
            ],
          }),
        );
      const provider = new MetaConnectionProvider(config, fetchFn as unknown as typeof fetch);

      const pages = await provider.listManagedPages('long-user-token');
      expect(pages).toHaveLength(2);
      const [firstUrl, firstInit] = fetchFn.mock.calls[0] as [URL, RequestInit];
      const [secondUrl] = fetchFn.mock.calls[1] as [URL, RequestInit];
      expect(firstUrl.origin).toBe('https://graph.facebook.com');
      expect(firstUrl.searchParams.has('access_token')).toBe(false);
      expect((firstInit.headers as Record<string, string>).authorization).toBe(
        'Bearer long-user-token',
      );
      expect(secondUrl.searchParams.get('after')).toBe('cursor-2');
      expect(secondUrl.origin).not.toBe('https://example.invalid');
    },
  );

  it('discovers the Page-linked Instagram Professional account', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: '111',
        instagram_business_account: {
          id: '333',
          username: 'recruitops',
          name: 'RecruitOps',
        },
      }),
    );
    const provider = new MetaConnectionProvider(config, fetchFn as unknown as typeof fetch);

    await expect(provider.getInstagramProfessionalAccount('111', 'page-token')).resolves.toEqual({
      id: '333',
      username: 'recruitops',
      name: 'RecruitOps',
    });
  });

  it(
    'fails closed on malformed provider responses and exposes only normalized error codes',
    async () => {
      const malformedFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: '111' }] }));
      const provider = new MetaConnectionProvider(
        config,
        malformedFetch as unknown as typeof fetch,
      );
      await expect(provider.listManagedPages('token')).rejects.toMatchObject({
        code: 'META_PAGE_DISCOVERY_RESPONSE_INVALID',
      });

      const failedFetch = vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: 'provider detail that must not be copied into the app error',
              code: 190,
            },
          },
          400,
        ),
      );
      const failedProvider = new MetaConnectionProvider(
        config,
        failedFetch as unknown as typeof fetch,
      );
      await expect(failedProvider.listManagedPages('token')).rejects.toEqual(
        new MetaConnectionError('META_PAGE_DISCOVERY_FAILED_PROVIDER_190', 400),
      );
    },
  );
});
