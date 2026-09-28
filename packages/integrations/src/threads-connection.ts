import { z } from 'zod';

export const THREADS_CONNECTION_SCOPES = ['threads_basic', 'threads_content_publish'] as const;

const ShortLivedTokenSchema = z
  .object({
    access_token: z.string().min(1),
    user_id: z.union([z.string().min(1), z.number().int().nonnegative()]),
  })
  .passthrough();

const LongLivedTokenSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().trim().min(1).optional(),
    expires_in: z.number().int().positive(),
  })
  .passthrough();

const ThreadsProfileSchema = z
  .object({
    id: z.string().min(1),
    username: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(255).optional(),
    threads_profile_picture_url: z.url().optional(),
  })
  .passthrough();

export interface ThreadsConnectionConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export interface ThreadsShortLivedToken {
  accessToken: string;
  userId: string;
}

export interface ThreadsLongLivedToken {
  accessToken: string;
  tokenType?: string;
  expiresInSeconds: number;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
}

export class ThreadsConnectionProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ThreadsConnectionProviderError';
  }
}

export class ThreadsConnectionProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ThreadsConnectionConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  buildAuthorizationUrl(state: string): string {
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', THREADS_CONNECTION_SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<ThreadsShortLivedToken> {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
      code,
    });
    const response = await this.fetchImpl('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const parsed = await this.parseResponse(
      response,
      ShortLivedTokenSchema,
      'THREADS_OAUTH_CODE_EXCHANGE_FAILED',
    );
    return { accessToken: parsed.access_token, userId: String(parsed.user_id) };
  }

  async exchangeLongLivedToken(shortLivedAccessToken: string): Promise<ThreadsLongLivedToken> {
    const url = new URL('https://graph.threads.net/access_token');
    url.searchParams.set('grant_type', 'th_exchange_token');
    url.searchParams.set('client_secret', this.config.appSecret);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${shortLivedAccessToken}` },
    });
    const parsed = await this.parseResponse(
      response,
      LongLivedTokenSchema,
      'THREADS_OAUTH_LONG_LIVED_EXCHANGE_FAILED',
    );
    return {
      accessToken: parsed.access_token,
      expiresInSeconds: parsed.expires_in,
      ...(parsed.token_type ? { tokenType: parsed.token_type } : {}),
    };
  }

  async getProfile(accessToken: string): Promise<ThreadsProfile> {
    const url = new URL('https://graph.threads.net/me');
    url.searchParams.set('fields', 'id,username,name,threads_profile_picture_url');
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const parsed = await this.parseResponse(
      response,
      ThreadsProfileSchema,
      'THREADS_PROFILE_FETCH_FAILED',
    );
    return {
      id: parsed.id,
      username: parsed.username,
      ...(parsed.name ? { name: parsed.name } : {}),
      ...(parsed.threads_profile_picture_url
        ? { profilePictureUrl: parsed.threads_profile_picture_url }
        : {}),
    };
  }

  private async parseResponse<TSchema extends z.ZodType>(
    response: Response,
    schema: TSchema,
    errorCode: string,
  ): Promise<z.output<TSchema>> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ThreadsConnectionProviderError(errorCode);
    }
    if (!response.ok) throw new ThreadsConnectionProviderError(errorCode);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ThreadsConnectionProviderError(errorCode);
    return parsed.data;
  }
}
