export const tikTokConnectionScopes = ['user.info.basic', 'video.publish'] as const;

export interface TikTokConnectionConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokAccessToken {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string;
  tokenType: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface TikTokUserProfile {
  openId: string;
  displayName: string;
  avatarUrl?: string | undefined;
}

export class TikTokConnectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'TikTokConnectionError';
  }
}

function required(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TikTokConnectionError(`TIKTOK_${name}_REQUIRED`);
  return normalized;
}

function normalizeRedirectUri(value: string): string {
  const raw = required('REDIRECT_URI', value);
  try {
    const url = new URL(raw);
    const localDevelopment =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    if (url.protocol !== 'https:' && !localDevelopment) {
      throw new Error('https required');
    }
    if (url.username || url.password || url.hash || url.search) {
      throw new Error('static redirect required');
    }
    return url.toString();
  } catch {
    throw new TikTokConnectionError('TIKTOK_REDIRECT_URI_INVALID');
  }
}

function parseToken(input: unknown): TikTokAccessToken {
  if (!input || typeof input !== 'object') {
    throw new TikTokConnectionError('TIKTOK_TOKEN_RESPONSE_INVALID');
  }
  const data = input as Record<string, unknown>;
  if (
    typeof data.access_token !== 'string' ||
    !data.access_token ||
    typeof data.refresh_token !== 'string' ||
    !data.refresh_token ||
    typeof data.open_id !== 'string' ||
    !data.open_id ||
    typeof data.scope !== 'string' ||
    typeof data.token_type !== 'string' ||
    typeof data.expires_in !== 'number' ||
    data.expires_in <= 0 ||
    typeof data.refresh_expires_in !== 'number' ||
    data.refresh_expires_in <= 0
  ) {
    throw new TikTokConnectionError('TIKTOK_TOKEN_RESPONSE_INVALID');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    scope: data.scope,
    tokenType: data.token_type,
    expiresInSeconds: data.expires_in,
    refreshExpiresInSeconds: data.refresh_expires_in,
  };
}

function parseUserInfo(input: unknown): TikTokUserProfile {
  if (!input || typeof input !== 'object') {
    throw new TikTokConnectionError('TIKTOK_USER_INFO_RESPONSE_INVALID');
  }
  const root = input as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== 'object' || (error as Record<string, unknown>).code !== 'ok') {
    throw new TikTokConnectionError('TIKTOK_USER_INFO_FAILED');
  }
  const data = root.data;
  if (!data || typeof data !== 'object') {
    throw new TikTokConnectionError('TIKTOK_USER_INFO_RESPONSE_INVALID');
  }
  const user = (data as Record<string, unknown>).user;
  if (!user || typeof user !== 'object') {
    throw new TikTokConnectionError('TIKTOK_USER_INFO_RESPONSE_INVALID');
  }
  const record = user as Record<string, unknown>;
  if (
    typeof record.open_id !== 'string' ||
    !record.open_id.trim() ||
    typeof record.display_name !== 'string' ||
    !record.display_name.trim()
  ) {
    throw new TikTokConnectionError('TIKTOK_USER_INFO_RESPONSE_INVALID');
  }
  return {
    openId: record.open_id.trim(),
    displayName: record.display_name.trim(),
    ...(typeof record.avatar_url === 'string' && record.avatar_url
      ? { avatarUrl: record.avatar_url }
      : {}),
  };
}

async function jsonRequest(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  operation: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new TikTokConnectionError(`TIKTOK_${operation}_NETWORK_ERROR`);
  }
  if (!response.ok) {
    throw new TikTokConnectionError(`TIKTOK_${operation}_FAILED`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new TikTokConnectionError(`TIKTOK_${operation}_RESPONSE_INVALID`, response.status);
  }
}

export class TikTokConnectionProvider {
  private readonly config: TikTokConnectionConfig;

  constructor(
    config: TikTokConnectionConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.config = {
      clientKey: required('CLIENT_KEY', config.clientKey),
      clientSecret: required('CLIENT_SECRET', config.clientSecret),
      redirectUri: normalizeRedirectUri(config.redirectUri),
    };
  }

  buildAuthorizationUrl(state: string): string {
    const normalizedState = required('OAUTH_STATE', state);
    if (normalizedState.length < 32 || normalizedState.length > 512) {
      throw new TikTokConnectionError('TIKTOK_OAUTH_STATE_INVALID');
    }
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', this.config.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', tikTokConnectionScopes.join(','));
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', normalizedState);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<TikTokAccessToken> {
    const payload = await jsonRequest(
      this.fetchFn,
      new URL('https://open.tiktokapis.com/v2/oauth/token/'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: this.config.clientKey,
          client_secret: this.config.clientSecret,
          code: required('AUTHORIZATION_CODE', code),
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri,
        }),
      },
      'TOKEN_EXCHANGE',
    );
    return parseToken(payload);
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokAccessToken> {
    const payload = await jsonRequest(
      this.fetchFn,
      new URL('https://open.tiktokapis.com/v2/oauth/token/'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: this.config.clientKey,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: required('REFRESH_TOKEN', refreshToken),
        }),
      },
      'TOKEN_REFRESH',
    );
    return parseToken(payload);
  }

  async getUserInfo(accessToken: string): Promise<TikTokUserProfile> {
    const url = new URL('https://open.tiktokapis.com/v2/user/info/');
    url.searchParams.set('fields', 'open_id,display_name,avatar_url');
    const payload = await jsonRequest(
      this.fetchFn,
      url,
      { headers: { authorization: `Bearer ${required('ACCESS_TOKEN', accessToken)}` } },
      'USER_INFO',
    );
    return parseUserInfo(payload);
  }
}
