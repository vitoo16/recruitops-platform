import { describe, expect, it, vi } from 'vitest';
import { TikTokConnectionProvider, tikTokConnectionScopes } from './tiktok-connection.js';

const config = {
  clientKey: 'client-key',
  clientSecret: 'client-secret',
  redirectUri: 'https://api.example.com/api/integrations/tiktok/oauth/callback',
};

function tokenResponse() {
  return {
    access_token: 'access-token',
    expires_in: 86400,
    open_id: 'open-id',
    refresh_expires_in: 31536000,
    refresh_token: 'refresh-token',
    scope: 'user.info.basic,video.publish',
    token_type: 'Bearer',
  };
}

describe('TikTokConnectionProvider', () => {
  it('builds the current web authorization URL with least-privilege publishing scopes', () => {
    const provider = new TikTokConnectionProvider(config);
    const state = 'a'.repeat(43);
    const url = new URL(provider.buildAuthorizationUrl(state));

    expect(url.toString()).not.toContain(config.clientSecret);
    expect(url.origin).toBe('https://www.tiktok.com');
    expect(url.pathname).toBe('/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe(config.clientKey);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(tikTokConnectionScopes.join(','));
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('exchanges a web authorization code for access and refresh tokens', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new TikTokConnectionProvider(config, fetchFn);

    await expect(provider.exchangeAuthorizationCode('code')).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      openId: 'open-id',
      expiresInSeconds: 86400,
      refreshExpiresInSeconds: 31536000,
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url.toString()).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_secret')).toBe(config.clientSecret);
    expect(body.get('redirect_uri')).toBe(config.redirectUri);
  });

  it('uses the rotated refresh token returned by TikTok', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...tokenResponse(), refresh_token: 'rotated-refresh' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new TikTokConnectionProvider(config, fetchFn);

    await expect(provider.refreshAccessToken('old-refresh')).resolves.toMatchObject({
      refreshToken: 'rotated-refresh',
    });
    const body = fetchFn.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh');
  });

  it('loads current basic user info with a bearer token', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { user: { open_id: 'open-id', display_name: 'TikTok Recruiter' } },
          error: { code: 'ok', message: '', log_id: 'log-id' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new TikTokConnectionProvider(config, fetchFn);

    await expect(provider.getUserInfo('access-token')).resolves.toEqual({
      openId: 'open-id',
      displayName: 'TikTok Recruiter',
    });
    expect(new Headers(fetchFn.mock.calls[0]![1]?.headers).get('authorization')).toBe(
      'Bearer access-token',
    );
  });

  it('fails closed on malformed successful token responses', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }));
    const provider = new TikTokConnectionProvider(config, fetchFn);
    await expect(provider.exchangeAuthorizationCode('code')).rejects.toMatchObject({
      code: 'TIKTOK_TOKEN_RESPONSE_INVALID',
    });
  });
});
