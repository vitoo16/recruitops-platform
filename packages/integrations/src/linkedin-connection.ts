export const linkedinMemberConnectionScopes = ['openid', 'profile', 'w_member_social'] as const;

export interface LinkedInConnectionConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface LinkedInAccessToken {
  accessToken: string;
  expiresInSeconds: number;
  scope?: string | undefined;
  idToken?: string | undefined;
}

export interface LinkedInMemberProfile {
  subject: string;
  name?: string | undefined;
  picture?: string | undefined;
}

export class LinkedInConnectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'LinkedInConnectionError';
  }
}

function requireNonEmpty(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new LinkedInConnectionError(`LINKEDIN_${name}_REQUIRED`);
  return normalized;
}

function normalizeRedirectUri(value: string): string {
  const redirectUri = requireNonEmpty('REDIRECT_URI', value);
  try {
    const url = new URL(redirectUri);
    const localDevelopment =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    if (url.protocol !== 'https:' && !localDevelopment) {
      throw new Error('redirect uri must use https outside localhost');
    }
    if (url.username || url.password) throw new Error('redirect uri must not contain credentials');
    return url.toString();
  } catch {
    throw new LinkedInConnectionError('LINKEDIN_REDIRECT_URI_INVALID');
  }
}

function normalizeConfig(input: LinkedInConnectionConfig): LinkedInConnectionConfig {
  return {
    clientId: requireNonEmpty('CLIENT_ID', input.clientId),
    clientSecret: requireNonEmpty('CLIENT_SECRET', input.clientSecret),
    redirectUri: normalizeRedirectUri(input.redirectUri),
  };
}

async function requestJson<T>(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  operation: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new LinkedInConnectionError(`LINKEDIN_${operation}_NETWORK_ERROR`);
  }

  if (!response.ok) {
    throw new LinkedInConnectionError(`LINKEDIN_${operation}_FAILED`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new LinkedInConnectionError(`LINKEDIN_${operation}_RESPONSE_INVALID`, response.status);
  }
}

function parseAccessToken(input: unknown): LinkedInAccessToken {
  if (!input || typeof input !== 'object') {
    throw new LinkedInConnectionError('LINKEDIN_TOKEN_EXCHANGE_RESPONSE_INVALID');
  }
  const data = input as Record<string, unknown>;
  if (
    typeof data.access_token !== 'string' ||
    data.access_token.length === 0 ||
    typeof data.expires_in !== 'number' ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    throw new LinkedInConnectionError('LINKEDIN_TOKEN_EXCHANGE_RESPONSE_INVALID');
  }
  if (data.scope !== undefined && typeof data.scope !== 'string') {
    throw new LinkedInConnectionError('LINKEDIN_TOKEN_EXCHANGE_RESPONSE_INVALID');
  }
  if (data.id_token !== undefined && typeof data.id_token !== 'string') {
    throw new LinkedInConnectionError('LINKEDIN_TOKEN_EXCHANGE_RESPONSE_INVALID');
  }

  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in,
    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
    ...(typeof data.id_token === 'string' ? { idToken: data.id_token } : {}),
  };
}

function parseProfile(input: unknown): LinkedInMemberProfile {
  if (!input || typeof input !== 'object') {
    throw new LinkedInConnectionError('LINKEDIN_PROFILE_RESPONSE_INVALID');
  }
  const data = input as Record<string, unknown>;
  if (typeof data.sub !== 'string' || data.sub.trim().length === 0 || data.sub.length > 255) {
    throw new LinkedInConnectionError('LINKEDIN_PROFILE_RESPONSE_INVALID');
  }
  if (data.name !== undefined && typeof data.name !== 'string') {
    throw new LinkedInConnectionError('LINKEDIN_PROFILE_RESPONSE_INVALID');
  }
  if (data.picture !== undefined && typeof data.picture !== 'string') {
    throw new LinkedInConnectionError('LINKEDIN_PROFILE_RESPONSE_INVALID');
  }

  return {
    subject: data.sub.trim(),
    ...(typeof data.name === 'string' && data.name.trim() ? { name: data.name.trim() } : {}),
    ...(typeof data.picture === 'string' && data.picture.trim()
      ? { picture: data.picture.trim() }
      : {}),
  };
}

export class LinkedInConnectionProvider {
  private readonly config: LinkedInConnectionConfig;

  constructor(
    config: LinkedInConnectionConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.config = normalizeConfig(config);
  }

  buildAuthorizationUrl(state: string): string {
    const normalizedState = requireNonEmpty('OAUTH_STATE', state);
    if (normalizedState.length < 32 || normalizedState.length > 512) {
      throw new LinkedInConnectionError('LINKEDIN_OAUTH_STATE_INVALID');
    }

    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', normalizedState);
    url.searchParams.set('scope', linkedinMemberConnectionScopes.join(' '));
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<LinkedInAccessToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: requireNonEmpty('AUTHORIZATION_CODE', code),
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const payload = await requestJson<unknown>(
      this.fetchFn,
      new URL('https://www.linkedin.com/oauth/v2/accessToken'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      },
      'TOKEN_EXCHANGE',
    );
    return parseAccessToken(payload);
  }

  async getProfile(accessToken: string): Promise<LinkedInMemberProfile> {
    const token = requireNonEmpty('ACCESS_TOKEN', accessToken);
    const payload = await requestJson<unknown>(
      this.fetchFn,
      new URL('https://api.linkedin.com/v2/userinfo'),
      { headers: { authorization: `Bearer ${token}` } },
      'PROFILE',
    );
    return parseProfile(payload);
  }
}
