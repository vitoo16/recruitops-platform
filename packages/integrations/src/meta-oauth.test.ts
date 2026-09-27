import { describe, expect, it, vi } from 'vitest';
import { getMissingMetaPermissions, MetaOAuthClient, MetaProviderError } from './meta-oauth.js';

const config = {
  appId: 'app-id',
  appSecret: 'server-secret',
  loginConfigId: 'business-login-config',
  redirectUri: 'https://api.example.com/api/social-connections/meta/callback',
  graphApiVersion: 'v26.0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MetaOAuthClient', () => {
  it('builds Facebook Login for Business authorization URLs without runtime scope overrides', () => {
    const client = new MetaOAuthClient(config);
    const url = new URL(client.buildAuthorizationUrl('signed-state'));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://www.facebook.com/v26.0/dialog/oauth',
    );
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('config_id')).toBe('business-login-config');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('exchanges an authorization code and never returns the app secret from the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'user-token', token_type: 'bearer', expires_in: 3600 }),
    );
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    await expect(client.exchangeAuthorizationCode('authorization-code')).resolves.toEqual({
      accessToken: 'user-token',
      tokenType: 'bearer',
      expiresIn: 3600,
    });
    expect(
      JSON.stringify(await client.exchangeAuthorizationCode('authorization-code')),
    ).not.toContain('server-secret');
  });

  it('returns only granted permissions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { permission: 'pages_manage_posts', status: 'granted' },
          { permission: 'pages_show_list', status: 'granted' },
          { permission: 'email', status: 'declined' },
        ],
      }),
    );
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    await expect(client.getGrantedPermissions('token')).resolves.toEqual([
      'pages_manage_posts',
      'pages_show_list',
    ]);
  });

  it('discovers managed Pages and linked Instagram professional accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: '123',
            name: 'RecruitOps Page',
            access_token: 'page-token',
            tasks: ['CREATE_CONTENT'],
            instagram_business_account: {
              id: '456',
              username: 'recruitops',
              name: 'RecruitOps',
            },
          },
        ],
      }),
    );
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    await expect(client.getManagedPages('user-token')).resolves.toEqual([
      {
        id: '123',
        name: 'RecruitOps Page',
        accessToken: 'page-token',
        tasks: ['CREATE_CONTENT'],
        instagramBusinessAccount: {
          id: '456',
          username: 'recruitops',
          name: 'RecruitOps',
        },
      },
    ]);
    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.headers).toMatchObject({ authorization: 'Bearer user-token' });
  });

  it('surfaces provider failures as sanitized error codes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'sensitive provider detail', code: 190 } }, 400),
      );
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    await expect(client.getGrantedPermissions('token')).rejects.toMatchObject({
      message: 'META_PROVIDER_REQUEST_FAILED',
      httpStatus: 400,
      providerCode: 190,
    } satisfies Partial<MetaProviderError>);
  });

  it('calculates missing permissions without mutating the granted set', () => {
    expect(
      getMissingMetaPermissions(
        ['pages_show_list', 'pages_read_engagement'],
        ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
      ),
    ).toEqual(['pages_manage_posts']);
  });
});
