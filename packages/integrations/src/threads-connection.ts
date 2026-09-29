export const threadsPublishingConnectionScopes = [
  'threads_basic',
  'threads_content_publish',
] as const;

export interface ThreadsConnectionConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface ThreadsAccessToken {
  accessToken: string;
  userId?: string | undefined;
  tokenType?: string | undefined;
  expiresInSeconds?: number | undefined;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name?: string | undefined;
}

export class ThreadsConnectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'ThreadsConnectionError';
  }
}

function requireNonEmpty(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ThreadsConnectionError(`THREADS_${name}_REQUIRED`);
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
    throw new ThreadsConnectionError('THREADS_REDIRECT_URI_INVALID');
  }
}

function normalizeConfig(input: ThreadsConnectionConfig): ThreadsConnectionConfig {
  return {
    appId: requireNonEmpty('APP_ID', input.appId),
    appSecret: requireNonEmpty('APP_SECRET', input.appSecret),
    redirectUri: normalizeRedirectUri(input.redirectUri),
  };
}

interface ThreadsApiErrorPayload {
  error?: {
    code?: number;
    type?: string;
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
    throw new ThreadsConnectionError(`THREADS_${operation}_NETWORK_ERROR`);
  }

  if (!response.ok) {
    let providerCode: number | undefined;
    try {
      const payload = (await response.json()) as ThreadsApiErrorPayload;
      providerCode = payload.error?.code;
    } catch {
      // Provider bodies are intentionally not copied into errors because they may contain sensitive data.
    }
    const suffix = providerCode === undefined ? '' : `_PROVIDER_${providerCode}`;
    throw new ThreadsConnectionError(`THREADS_${operation}_FAILED${suffix}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`, response.status);
  }
}

function parseAccessToken(input: unknown, operation: string): ThreadsAccessToken {
  if (!input || typeof input !== 'object') {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  const data = input as Record<string, unknown>;
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  if (data.user_id !== undefined && typeof data.user_id !== 'string') {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  if (data.token_type !== undefined && typeof data.token_type !== 'string') {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  if (data.expires_in !== undefined && typeof data.expires_in !== 'number') {
    throw new ThreadsConnectionError(`THREADS_${operation}_RESPONSE_INVALID`);
  }

  return {
    accessToken: data.access_token,
    ...(typeof data.user_id === 'string' ? { userId: data.user_id } : {}),
    ...(typeof data.token_type === 'string' ? { tokenType: data.token_type } : {}),
    ...(typeof data.expires_in === 'number' ? { expiresInSeconds: data.expires_in } : {}),
  };
}

function parseProfile(input: unknown): ThreadsProfile {
  if (!input || typeof input !== 'object') {
    throw new ThreadsConnectionError('THREADS_PROFILE_RESPONSE_INVALID');
  }
  const data = input as Record<string, unknown>;
  if (
    typeof data.id !== 'string' ||
    !/^\d{1,32}$/.test(data.id) ||
    typeof data.username !== 'string' ||
    data.username.trim().length === 0
  ) {
    throw new ThreadsConnectionError('THREADS_PROFILE_RESPONSE_INVALID');
  }
  if (data.name !== undefined && typeof data.name !== 'string') {
    throw new ThreadsConnectionError('THREADS_PROFILE_RESPONSE_INVALID');
  }

  return {
    id: data.id,
    username: data.username.trim(),
    ...(typeof data.name === 'string' && data.name.trim() ? { name: data.name.trim() } : {}),
  };
}

export class ThreadsConnectionProvider {
  private readonly config: ThreadsConnectionConfig;

  constructor(
    config: ThreadsConnectionConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.config = normalizeConfig(config);
  }

  buildAuthorizationUrl(state: string): string {
    const normalizedState = requireNonEmpty('OAUTH_STATE', state);
    if (normalizedState.length < 32 || normalizedState.length > 512) {
      throw new ThreadsConnectionError('THREADS_OAUTH_STATE_INVALID');
    }

    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', threadsPublishingConnectionScopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', normalizedState);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<ThreadsAccessToken> {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
      code: requireNonEmpty('AUTHORIZATION_CODE', code),
    });
    const payload = await requestJson<unknown>(
      this.fetchFn,
      new URL('https://graph.threads.net/oauth/access_token'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      },
      'TOKEN_EXCHANGE',
    );
    return parseAccessToken(payload, 'TOKEN_EXCHANGE');
  }

  async exchangeLongLivedToken(shortLivedAccessToken: string): Promise<ThreadsAccessToken> {
    const token = requireNonEmpty('ACCESS_TOKEN', shortLivedAccessToken);
    const url = new URL('https://graph.threads.net/access_token');
    url.searchParams.set('grant_type', 'th_exchange_token');
    url.searchParams.set('client_secret', this.config.appSecret);
    const payload = await requestJson<unknown>(
      this.fetchFn,
      url,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      },
      'LONG_LIVED_TOKEN_EXCHANGE',
    );
    return parseAccessToken(payload, 'LONG_LIVED_TOKEN_EXCHANGE');
  }

  async getProfile(accessToken: string): Promise<ThreadsProfile> {
    const token = requireNonEmpty('ACCESS_TOKEN', accessToken);
    const url = new URL('https://graph.threads.net/me');
    url.searchParams.set('fields', 'id,username,name');
    const payload = await requestJson<unknown>(
      this.fetchFn,
      url,
      { headers: { authorization: `Bearer ${token}` } },
      'PROFILE',
    );
    return parseProfile(payload);
  }
}
