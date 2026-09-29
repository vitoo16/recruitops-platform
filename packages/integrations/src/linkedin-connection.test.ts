import { describe, expect, it, vi } from 'vitest';
import {
  LinkedInConnectionError,
  LinkedInConnectionProvider,
  linkedinMemberConnectionScopes,
} from './linkedin-connection.js';

describe('LinkedInConnectionProvider', () => {
  const config = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://api.example.com/api/integrations/linkedin/oauth/callback',
  };

  it('builds the official authorization-code URL with least-privilege member scopes', () => {
    const provider = new LinkedInConnectionProvider(config);
    const state = 'a'.repeat(43);
    const url = new URL(provider.buildAuthorizationUrl(state));

    expect(url.origin).toBe('https://www.linkedin.com');
    expect(url.pathname).toBe('/oauth/v2/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(config.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...linkedinMemberConnectionScopes]);
    expect(url.toString()).not.toContain(config.clientSecret);
  });

  it('exchanges the code server-side and parses access-token expiry', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'member-token',
          expires_in: 5_184_000,
          scope: 'openid profile w_member_social',
          id_token: 'header.payload.signature',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new LinkedInConnectionProvider(config, fetchFn);

    await expect(provider.exchangeAuthorizationCode('authorization-code')).resolves.toEqual({
      accessToken: 'member-token',
      expiresInSeconds: 5_184_000,
      scope: 'openid profile w_member_social',
      idToken: 'header.payload.signature',
    });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url.toString()).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(init?.method).toBe('POST');
    const body = init?.body as URLSearchParams;
    expect(body.get('client_secret')).toBe(config.clientSecret);
    expect(body.get('redirect_uri')).toBe(config.redirectUri);
  });

  it('loads the authenticated member through OIDC userinfo', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ sub: 'member-subject', name: 'Recruiter Name' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new LinkedInConnectionProvider(config, fetchFn);

    await expect(provider.getProfile('member-token')).resolves.toEqual({
      subject: 'member-subject',
      name: 'Recruiter Name',
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url.toString()).toBe('https://api.linkedin.com/v2/userinfo');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer member-token');
  });

  it('fails closed on malformed successful provider responses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'member-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new LinkedInConnectionProvider(config, fetchFn);

    await expect(provider.exchangeAuthorizationCode('authorization-code')).rejects.toMatchObject({
      code: 'LINKEDIN_TOKEN_EXCHANGE_RESPONSE_INVALID',
    });
  });

  it('rejects insecure non-local redirect URIs', () => {
    expect(
      () =>
        new LinkedInConnectionProvider({
          ...config,
          redirectUri: 'http://example.com/callback',
        }),
    ).toThrowError(LinkedInConnectionError);
  });
});
