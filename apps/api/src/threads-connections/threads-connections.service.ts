import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  THREADS_CONNECTION_SCOPES,
  ThreadsConnectionProviderError,
} from '@recruitops/integrations';
import { z } from 'zod';
import { OAuthCredentialCipher } from '../social-credentials/oauth-credential-cipher.js';
import { ThreadsConnectionClientFactory } from './threads-connection-client.factory.js';
import { ThreadsConnectionsRepository } from './threads-connections.repository.js';
import { ThreadsOAuthSessionStore } from './threads-oauth-session.store.js';

const CallbackQuerySchema = z
  .object({
    code: z.string().trim().min(1).max(16_384).optional(),
    state: z.string().trim().min(1).max(1024).optional(),
    error: z.string().trim().min(1).max(255).optional(),
  })
  .passthrough();

@Injectable()
export class ThreadsConnectionsService {
  constructor(
    private readonly clients: ThreadsConnectionClientFactory,
    private readonly sessions: ThreadsOAuthSessionStore,
    private readonly repository: ThreadsConnectionsRepository,
    private readonly cipher: OAuthCredentialCipher,
  ) {}

  async start(userId: string) {
    const state = randomBytes(32).toString('base64url');
    const pending = await this.sessions.createPending({ state, userId });
    const provider = this.clients.create();
    return {
      authorizationUrl: provider.buildAuthorizationUrl(state),
      expiresAt: pending.expiresAt,
    };
  }

  async callback(rawQuery: Record<string, unknown>) {
    const parsedQuery = CallbackQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      throw new BadRequestException({
        code: 'THREADS_OAUTH_CALLBACK_INVALID',
        message: 'Threads OAuth callback is invalid',
      });
    }
    const query = parsedQuery.data;
    if (query.error) {
      throw new BadRequestException({
        code: 'THREADS_OAUTH_DENIED',
        message: 'Threads authorization was denied',
      });
    }
    if (!query.code || !query.state) {
      throw new BadRequestException({
        code: 'THREADS_OAUTH_CALLBACK_INVALID',
        message: 'Threads OAuth callback is missing required parameters',
      });
    }

    const pending = await this.sessions.consumePending(query.state);
    if (!pending) {
      throw new UnauthorizedException({
        code: 'THREADS_OAUTH_STATE_INVALID',
        message: 'Threads OAuth state is invalid or expired',
      });
    }

    const provider = this.clients.create();
    try {
      const shortLived = await provider.exchangeCode(query.code);
      const longLived = await provider.exchangeLongLivedToken(shortLived.accessToken);
      const profile = await provider.getProfile(longLived.accessToken);
      if (profile.id !== shortLived.userId) {
        throw new BadGatewayException({
          code: 'THREADS_OAUTH_PROFILE_MISMATCH',
          message: 'Threads OAuth profile does not match exchanged token user',
        });
      }

      const expiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1_000).toISOString();
      const credential = this.cipher.encrypt('THREADS', {
        accessToken: longLived.accessToken,
        scopes: [...THREADS_CONNECTION_SCOPES],
        expiresAt,
        ...(longLived.tokenType ? { tokenType: longLived.tokenType } : {}),
      });
      const displayName = profile.name?.trim() || `@${profile.username}`;
      const promoted = await this.repository.promote({
        externalAccountId: profile.id,
        displayName,
        scopes: [...THREADS_CONNECTION_SCOPES],
        expiresAt,
        credential,
      });

      return {
        connectedByUserId: pending.userId,
        account: promoted,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof ThreadsConnectionProviderError) {
        throw new BadGatewayException({
          code: error.code,
          message: 'Threads provider request failed',
        });
      }
      throw error;
    }
  }
}
