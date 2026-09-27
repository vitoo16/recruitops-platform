import { describe, expect, it, vi } from 'vitest';
import { getMissingMetaPermissions } from './meta-oauth.js';
import { MetaOAuthClient } from './meta-oauth.js';
import { MetaProviderError } from './meta-oauth.js';

const AUTH_URL = 'https://www.facebook.com/v26.0/dialog/oauth';
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
  it('builds Facebook Login for Business URLs without runtime scope overrides', () => {
    const client = new MetaOAuthClient(config);
    const url = new URL(client.buildAuthorizationUrl('signed-state'));
    const endpoint = `${url.origin}${url.pathname}`;

    expect(endpoint).toBe(AUTH_URL);
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('config_id')).toBe('business-login-config');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('exchanges an authorization code without exposing the app secret', async () => {
    const responseBody = {
      access_token: 'user-token',
      token_type: 'bearer',
      expires_in: 3600,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    const result = await client.exchangeAuthorizationCode('authorization-code');
    expect(result).toEqual({
      accessToken: 'user-token',
      tokenType: 'bearer',
      expiresIn: 3600,
    });
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });

  it('returns only granted permissions', async () => {
    const responseBody = {
      data: [
        { permission: 'pages_manage_posts', status: 'granted' },
        { permission: 'pages_show_list', status: 'granted' },
        { permission: 'email', status: 'declined' },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    const permissions = await client.getGrantedPermissions('token');
    expect(permissions).toEqual(['pages_manage_posts', 'pages_show_list']);
  });

  it('discovers managed Pages and linked Instagram professional accounts', async () => {
    const responseBody = {
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
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    const pages = await client.getManagedPages('user-token');
    expect(pages).toEqual([
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

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.headers).toMatchObject({ authorization: 'Bearer user-token' });
  });

  it('surfaces provider failures as sanitized error codes', async () => {
    const responseBody = {
      error: { message: 'sensitive provider detail', code: 190 },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody, 400));
    const client = new MetaOAuthClient(config, fetchMock as typeof fetch);

    await expect(client.getGrantedPermissions('token')).rejects.toMatchObject({
      message: 'META_PROVIDER_REQUEST_FAILED',
      httpStatus: 400,
      providerCode: 190,
    } satisfies Partial<MetaProviderError>);
  });

  it('calculates missing permissions without mutating the granted set', () => {
    const granted = ['pages_show_list', 'pages_read_engagement'];
    const required = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ];

    expect(getMissingMetaPermissions(granted, required)).toEqual(['pages_manage_posts']);
  });
});
