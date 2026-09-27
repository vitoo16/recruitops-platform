export const DEFAULT_META_GRAPH_API_VERSION = 'v26.0';

export const META_PAGE_REQUIRED_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

export const META_INSTAGRAM_REQUIRED_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
] as const;

export interface MetaOAuthClientConfig {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
  graphApiVersion?: string;
}

export interface MetaTokenResult {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
}

export interface MetaInstagramBusinessAccount {
  id: string;
  username?: string;
  name?: string;
}

export interface MetaManagedPage {
  id: string;
  name: string;
  accessToken?: string;
  tasks: readonly string[];
  instagramBusinessAccount?: MetaInstagramBusinessAccount;
}

type FetchLike = typeof fetch;

interface MetaProviderErrorOptions {
  httpStatus?: number;
  providerCode?: number;
}

export class MetaProviderError extends Error {
  readonly httpStatus: number | undefined;
  readonly providerCode: number | undefined;

  constructor(code: string, options: MetaProviderErrorOptions = {}) {
    super(code);
    this.name = 'MetaProviderError';
    this.httpStatus = options.httpStatus;
    this.providerCode = options.providerCode;
  }
}

function graphApiVersion(config: MetaOAuthClientConfig): string {
  const value = config.graphApiVersion ?? DEFAULT_META_GRAPH_API_VERSION;
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new MetaProviderError('META_GRAPH_API_VERSION_INVALID');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function providerErrorCode(body: unknown): number | undefined {
  const root = asRecord(body);
  const error = root ? asRecord(root.error) : null;
  return typeof error?.code === 'number' ? error.code : undefined;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new MetaProviderError('META_PROVIDER_RESPONSE_INVALID', {
      httpStatus: response.status,
    });
  }
}

export function getMissingMetaPermissions(
  grantedPermissions: readonly string[],
  requiredPermissions: readonly string[],
): string[] {
  const granted = new Set(grantedPermissions);
  return requiredPermissions.filter((permission) => !granted.has(permission));
}

export class MetaOAuthClient {
  constructor(
    private readonly config: MetaOAuthClientConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  buildAuthorizationUrl(state: string): string {
    if (!state.trim()) throw new MetaProviderError('META_OAUTH_STATE_REQUIRED');

    const version = graphApiVersion(this.config);
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('config_id', this.config.loginConfigId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('override_default_response_type', 'true');
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<MetaTokenResult> {
    if (!code.trim()) throw new MetaProviderError('META_AUTHORIZATION_CODE_REQUIRED');

    const version = graphApiVersion(this.config);
    const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('client_secret', this.config.appSecret);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('code', code);

    const body = await this.requestJson(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const record = asRecord(body);
    const accessToken = record?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new MetaProviderError('META_TOKEN_RESPONSE_INVALID');
    }

    const tokenType = typeof record.token_type === 'string' ? record.token_type : undefined;
    const expiresIn =
      typeof record.expires_in === 'number' && Number.isFinite(record.expires_in)
        ? record.expires_in
        : undefined;

    return {
      accessToken,
      ...(tokenType ? { tokenType } : {}),
      ...(expiresIn !== undefined ? { expiresIn } : {}),
    };
  }

  async getGrantedPermissions(accessToken: string): Promise<string[]> {
    const version = graphApiVersion(this.config);
    const url = new URL(`https://graph.facebook.com/${version}/me/permissions`);
    const body = await this.requestJson(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    const record = asRecord(body);
    if (!Array.isArray(record?.data)) {
      throw new MetaProviderError('META_PERMISSIONS_RESPONSE_INVALID');
    }

    const granted = record.data.flatMap((item) => {
      const permission = asRecord(item);
      if (permission?.status !== 'granted') return [];
      return typeof permission.permission === 'string' ? [permission.permission] : [];
    });
    return [...new Set(granted)].sort();
  }

  async getManagedPages(accessToken: string): Promise<MetaManagedPage[]> {
    const pages: MetaManagedPage[] = [];
    const version = graphApiVersion(this.config);
    let after: string | undefined;

    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      const url = new URL(`https://graph.facebook.com/${version}/me/accounts`);
      url.searchParams.set(
        'fields',
        'id,name,access_token,tasks,instagram_business_account{id,username,name}',
      );
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);

      const body = await this.requestJson(url, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      });
      const root = asRecord(body);
      if (!Array.isArray(root?.data)) {
        throw new MetaProviderError('META_PAGES_RESPONSE_INVALID');
      }

      for (const item of root.data) {
        const page = asRecord(item);
        if (typeof page?.id !== 'string' || typeof page.name !== 'string') continue;

        const instagram = asRecord(page.instagram_business_account);
        const instagramId = typeof instagram?.id === 'string' ? instagram.id : undefined;
        const instagramUsername =
          typeof instagram?.username === 'string' ? instagram.username : undefined;
        const instagramName = typeof instagram?.name === 'string' ? instagram.name : undefined;
        const instagramAccount = instagramId
          ? {
              id: instagramId,
              ...(instagramUsername ? { username: instagramUsername } : {}),
              ...(instagramName ? { name: instagramName } : {}),
            }
          : undefined;

        const tasks = Array.isArray(page.tasks)
          ? page.tasks.filter((task): task is string => typeof task === 'string')
          : [];
        pages.push({
          id: page.id,
          name: page.name,
          ...(typeof page.access_token === 'string' ? { accessToken: page.access_token } : {}),
          tasks,
          ...(instagramAccount ? { instagramBusinessAccount: instagramAccount } : {}),
        });
      }

      const paging = asRecord(root.paging);
      const cursors = paging ? asRecord(paging.cursors) : null;
      const nextAfter = typeof cursors?.after === 'string' ? cursors.after : undefined;
      const hasNextPage = typeof paging?.next === 'string' && paging.next.length > 0;
      if (!nextAfter || !hasNextPage) return pages;
      after = nextAfter;
    }

    throw new MetaProviderError('META_PAGE_DISCOVERY_LIMIT_EXCEEDED');
  }

  private async requestJson(url: URL, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch {
      throw new MetaProviderError('META_PROVIDER_UNAVAILABLE');
    }

    const body = await parseJson(response);
    if (!response.ok) {
      throw new MetaProviderError('META_PROVIDER_REQUEST_FAILED', {
        httpStatus: response.status,
        providerCode: providerErrorCode(body),
      });
    }
    return body;
  }
}
