export const facebookPageConnectionScopes = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

export const instagramFacebookLoginConnectionScopes = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
] as const;

export type MetaConnectionTarget = 'FACEBOOK' | 'INSTAGRAM';

export interface MetaConnectionConfig {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  redirectUri: string;
}

export interface MetaAccessToken {
  accessToken: string;
  tokenType?: string | undefined;
  expiresInSeconds?: number | undefined;
}

export interface MetaManagedPage {
  id: string;
  name: string;
  accessToken: string;
  tasks: readonly string[];
}

export interface MetaInstagramProfessionalAccount {
  id: string;
  username?: string | undefined;
  name?: string | undefined;
}

export interface MetaDiscoveredPage extends MetaManagedPage {
  instagramProfessionalAccount: MetaInstagramProfessionalAccount | null;
}

export class MetaConnectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'MetaConnectionError';
  }
}

function requireNonEmpty(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MetaConnectionError(`META_${name}_REQUIRED`);
  return normalized;
}

function normalizeGraphApiVersion(value: string): string {
  const normalized = requireNonEmpty('GRAPH_API_VERSION', value);
  if (!/^v\d+\.\d+$/.test(normalized)) {
    throw new MetaConnectionError('META_GRAPH_API_VERSION_INVALID');
  }
  return normalized;
}

function normalizeConfig(input: MetaConnectionConfig): MetaConnectionConfig {
  const redirectUri = requireNonEmpty('REDIRECT_URI', input.redirectUri);
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('redirect uri must use https outside localhost');
    }
  } catch {
    throw new MetaConnectionError('META_REDIRECT_URI_INVALID');
  }

  return {
    appId: requireNonEmpty('APP_ID', input.appId),
    appSecret: requireNonEmpty('APP_SECRET', input.appSecret),
    graphApiVersion: normalizeGraphApiVersion(input.graphApiVersion),
    redirectUri,
  };
}

export function buildMetaConnectionScopes(
  targets: readonly MetaConnectionTarget[],
): readonly string[] {
  const scopes = new Set<string>();
  for (const target of targets) {
    const required =
      target === 'FACEBOOK' ? facebookPageConnectionScopes : instagramFacebookLoginConnectionScopes;
    for (const scope of required) scopes.add(scope);
  }
  if (scopes.size === 0) throw new MetaConnectionError('META_CONNECTION_TARGET_REQUIRED');
  return [...scopes];
}

interface MetaApiErrorPayload {
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
    throw new MetaConnectionError(`META_${operation}_NETWORK_ERROR`);
  }

  if (!response.ok) {
    let providerCode: number | undefined;
    try {
      const payload = (await response.json()) as MetaApiErrorPayload;
      providerCode = payload.error?.code;
    } catch {
      // Do not include provider response bodies in errors because they may contain sensitive data.
    }
    const suffix = providerCode === undefined ? '' : `_PROVIDER_${providerCode}`;
    throw new MetaConnectionError(`META_${operation}_FAILED${suffix}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new MetaConnectionError(`META_${operation}_RESPONSE_INVALID`, response.status);
  }
}

function parseAccessToken(input: unknown, operation: string): MetaAccessToken {
  if (!input || typeof input !== 'object') {
    throw new MetaConnectionError(`META_${operation}_RESPONSE_INVALID`);
  }
  const data = input as Record<string, unknown>;
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new MetaConnectionError(`META_${operation}_RESPONSE_INVALID`);
  }
  if (data.expires_in !== undefined && typeof data.expires_in !== 'number') {
    throw new MetaConnectionError(`META_${operation}_RESPONSE_INVALID`);
  }
  if (data.token_type !== undefined && typeof data.token_type !== 'string') {
    throw new MetaConnectionError(`META_${operation}_RESPONSE_INVALID`);
  }
  return {
    accessToken: data.access_token,
    ...(data.token_type ? { tokenType: data.token_type } : {}),
    ...(data.expires_in !== undefined ? { expiresInSeconds: data.expires_in } : {}),
  };
}

function assertGraphId(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,32}$/.test(normalized)) {
    throw new MetaConnectionError('META_GRAPH_ID_INVALID');
  }
  return normalized;
}

export class MetaConnectionProvider {
  private readonly config: MetaConnectionConfig;

  constructor(
    config: MetaConnectionConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.config = normalizeConfig(config);
  }

  buildAuthorizationUrl(input: {
    state: string;
    targets: readonly MetaConnectionTarget[];
  }): string {
    const state = requireNonEmpty('OAUTH_STATE', input.state);
    if (state.length < 32 || state.length > 512) {
      throw new MetaConnectionError('META_OAUTH_STATE_INVALID');
    }
    const url = new URL(
      `https://www.facebook.com/${this.config.graphApiVersion}/dialog/oauth`,
    );
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', buildMetaConnectionScopes(input.targets).join(','));
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<MetaAccessToken> {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code: requireNonEmpty('AUTHORIZATION_CODE', code),
    });
    const url = new URL(
      `https://graph.facebook.com/${this.config.graphApiVersion}/oauth/access_token`,
    );
    const payload = await requestJson<unknown>(this.fetchFn, url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, 'TOKEN_EXCHANGE');
    return parseAccessToken(payload, 'TOKEN_EXCHANGE');
  }

  async exchangeLongLivedUserToken(shortLivedAccessToken: string): Promise<MetaAccessToken> {
    const body = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: requireNonEmpty('ACCESS_TOKEN', shortLivedAccessToken),
    });
    const url = new URL(
      `https://graph.facebook.com/${this.config.graphApiVersion}/oauth/access_token`,
    );
    const payload = await requestJson<unknown>(this.fetchFn, url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, 'LONG_LIVED_TOKEN_EXCHANGE');
    return parseAccessToken(payload, 'LONG_LIVED_TOKEN_EXCHANGE');
  }

  async listManagedPages(userAccessToken: string): Promise<readonly MetaManagedPage[]> {
    const token = requireNonEmpty('ACCESS_TOKEN', userAccessToken);
    const pages: MetaManagedPage[] = [];
    let after: string | undefined;

    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const url = new URL(`https://graph.facebook.com/${this.config.graphApiVersion}/me/accounts`);
      url.searchParams.set('fields', 'id,name,access_token,tasks');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);

      const payload = await requestJson<{
        data?: unknown[];
        paging?: { cursors?: { after?: string } };
      }>(this.fetchFn, url, {
        headers: { authorization: `Bearer ${token}` },
      }, 'PAGE_DISCOVERY');

      if (!Array.isArray(payload.data)) {
        throw new MetaConnectionError('META_PAGE_DISCOVERY_RESPONSE_INVALID');
      }

      for (const raw of payload.data) {
        if (!raw || typeof raw !== 'object') {
          throw new MetaConnectionError('META_PAGE_DISCOVERY_RESPONSE_INVALID');
        }
        const item = raw as Record<string, unknown>;
        if (
          typeof item.id !== 'string' ||
          typeof item.name !== 'string' ||
          typeof item.access_token !== 'string' ||
          !Array.isArray(item.tasks) ||
          !item.tasks.every((task) => typeof task === 'string')
        ) {
          throw new MetaConnectionError('META_PAGE_DISCOVERY_RESPONSE_INVALID');
        }
        pages.push({
          id: item.id,
          name: item.name,
          accessToken: item.access_token,
          tasks: item.tasks,
        });
      }

      const nextAfter = payload.paging?.cursors?.after;
      if (!nextAfter) return pages;
      after = nextAfter;
    }

    throw new MetaConnectionError('META_PAGE_DISCOVERY_PAGINATION_LIMIT');
  }

  async getInstagramProfessionalAccount(
    pageId: string,
    pageAccessToken: string,
  ): Promise<MetaInstagramProfessionalAccount | null> {
    const id = assertGraphId(pageId);
    const token = requireNonEmpty('ACCESS_TOKEN', pageAccessToken);
    const url = new URL(`https://graph.facebook.com/${this.config.graphApiVersion}/${id}`);
    url.searchParams.set('fields', 'instagram_business_account{id,username,name}');
    const payload = await requestJson<Record<string, unknown>>(this.fetchFn, url, {
      headers: { authorization: `Bearer ${token}` },
    }, 'INSTAGRAM_DISCOVERY');

    const raw = payload.instagram_business_account;
    if (raw === undefined || raw === null) return null;
    if (!raw || typeof raw !== 'object') {
      throw new MetaConnectionError('META_INSTAGRAM_DISCOVERY_RESPONSE_INVALID');
    }
    const account = raw as Record<string, unknown>;
    if (typeof account.id !== 'string') {
      throw new MetaConnectionError('META_INSTAGRAM_DISCOVERY_RESPONSE_INVALID');
    }
    if (account.username !== undefined && typeof account.username !== 'string') {
      throw new MetaConnectionError('META_INSTAGRAM_DISCOVERY_RESPONSE_INVALID');
    }
    if (account.name !== undefined && typeof account.name !== 'string') {
      throw new MetaConnectionError('META_INSTAGRAM_DISCOVERY_RESPONSE_INVALID');
    }
    return {
      id: account.id,
      ...(account.username ? { username: account.username } : {}),
      ...(account.name ? { name: account.name } : {}),
    };
  }

  async discoverAccounts(userAccessToken: string): Promise<readonly MetaDiscoveredPage[]> {
    const pages = await this.listManagedPages(userAccessToken);
    return Promise.all(
      pages.map(async (page) => ({
        ...page,
        instagramProfessionalAccount: await this.getInstagramProfessionalAccount(
          page.id,
          page.accessToken,
        ),
      })),
    );
  }
}
