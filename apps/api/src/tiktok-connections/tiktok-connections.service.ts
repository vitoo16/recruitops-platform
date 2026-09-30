import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TikTokConnectionError, tikTokConnectionScopes } from '@recruitops/integrations';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import {
  OAuthCredentialCipher,
  parseOAuthCredentialKeyring,
} from '../social-credentials/oauth-credential-cipher.js';
import { TikTokConnectionClientFactory } from './tiktok-connection-client.factory.js';
import { TikTokConnectionsRepository } from './tiktok-connections.repository.js';
import { TikTokOAuthStateStore } from './tiktok-oauth-state.store.js';

const CallbackSchema = z
  .object({
    state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code: z.string().trim().min(1).max(8192).optional(),
    error: z.string().trim().min(1).max(128).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if ((value.code === undefined) === (value.error === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message: 'Exactly one of code or error is required',
      });
    }
  });

function scopesFrom(value: string): readonly string[] {
  const scopes = value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const missing = tikTokConnectionScopes.filter((scope) => !scopes.includes(scope));
  if (missing.length > 0) {
    throw new BadGatewayException({
      code: 'TIKTOK_OAUTH_REQUIRED_SCOPE_MISSING',
      message: 'TikTok did not grant all required scopes',
    });
  }
  return scopes;
}

@Injectable()
export class TikTokConnectionsService {
  constructor(
    private readonly states: TikTokOAuthStateStore,
    private readonly cipher: OAuthCredentialCipher,
    private readonly clients: TikTokConnectionClientFactory,
    private readonly repository: TikTokConnectionsRepository,
  ) {}

  async list() {
    return { accounts: await this.repository.list() };
  }

  async start(userId: string) {
    this.assertEncryption();
    const provider = this.clients.create();
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = provider.buildAuthorizationUrl(state);
    const pending = await this.states.create({ state, userId });
    return { authorizationUrl, expiresAt: pending.expiresAt };
  }

  async callback(query: unknown) {
    const request = parseRequest(CallbackSchema, query);
    const pending = await this.states.consume(request.state);
    if (!pending) {
      throw new BadRequestException({
        code: 'TIKTOK_OAUTH_STATE_INVALID_OR_EXPIRED',
        message: 'TikTok OAuth state is invalid, expired, or already used',
      });
    }
    if (request.error) {
      throw new BadRequestException({
        code: 'TIKTOK_OAUTH_DENIED',
        message: 'TikTok authorization was not completed',
      });
    }

    this.assertEncryption();
    const provider = this.clients.create();
    try {
      const token = await provider.exchangeAuthorizationCode(request.code!);
      const scopes = scopesFrom(token.scope);
      const profile = await provider.getUserInfo(token.accessToken);
      if (profile.openId !== token.openId) {
        throw new BadGatewayException({
          code: 'TIKTOK_OAUTH_IDENTITY_MISMATCH',
          message: 'TikTok token and profile identity do not match',
        });
      }
      const now = Date.now();
      const expiresAt = new Date(now + token.expiresInSeconds * 1000).toISOString();
      const refreshExpiresAt = new Date(now + token.refreshExpiresInSeconds * 1000).toISOString();
      const credential = this.cipher.encrypt('TIKTOK', {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenType: token.tokenType,
        scopes: [...scopes],
        expiresAt,
        refreshExpiresAt,
      });
      const connected = await this.repository.promote({
        externalAccountId: token.openId,
        displayName: profile.displayName,
        scopes,
        expiresAt,
        credential,
      });
      return { connected, initiatedByUserId: pending.userId };
    } catch (error) {
      if (error instanceof TikTokConnectionError) {
        throw new BadGatewayException({
          code: error.code,
          message: 'TikTok provider request failed',
        });
      }
      throw error;
    }
  }

  private assertEncryption(): void {
    try {
      parseOAuthCredentialKeyring();
    } catch {
      throw new ServiceUnavailableException({
        code: 'OAUTH_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED',
        message: 'OAuth credential encryption is not configured',
      });
    }
  }
}
