import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ThreadsConnectionError,
  threadsPublishingConnectionScopes,
} from '@recruitops/integrations';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import {
  OAuthCredentialCipher,
  parseOAuthCredentialKeyring,
} from '../social-credentials/oauth-credential-cipher.js';
import { ThreadsConnectionClientFactory } from './threads-connection-client.factory.js';
import { ThreadsConnectionsRepository } from './threads-connections.repository.js';
import { ThreadsOAuthStateStore } from './threads-oauth-state.store.js';

const ThreadsOAuthCallbackSchema = z
  .object({
    state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code: z.string().trim().min(1).max(8_192).optional(),
    error: z.string().trim().min(1).max(128).optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const hasCode = value.code !== undefined;
    const hasError = value.error !== undefined;
    if (hasCode === hasError) {
      context.addIssue({
        code: 'custom',
        path: ['code'],
        message: 'Exactly one of code or error is required',
      });
    }
  });

@Injectable()
export class ThreadsConnectionsService {
  constructor(
    private readonly states: ThreadsOAuthStateStore,
    private readonly cipher: OAuthCredentialCipher,
    private readonly clients: ThreadsConnectionClientFactory,
    private readonly repository: ThreadsConnectionsRepository,
  ) {}

  async list() {
    return { accounts: await this.repository.list() };
  }

  async start(userId: string) {
    this.assertCredentialEncryptionConfigured();
    const provider = this.clients.create();
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = provider.buildAuthorizationUrl(state);
    const pending = await this.states.create({ state, userId });

    return {
      authorizationUrl,
      expiresAt: pending.expiresAt,
    };
  }

  async callback(query: unknown) {
    const request = parseRequest(ThreadsOAuthCallbackSchema, query);
    const pending = await this.states.consume(request.state);
    if (!pending) {
      throw new BadRequestException({
        code: 'THREADS_OAUTH_STATE_INVALID_OR_EXPIRED',
        message: 'Threads OAuth state is invalid, expired, or already used',
      });
    }

    if (request.error) {
      throw new BadRequestException({
        code: 'THREADS_OAUTH_DENIED',
        message: 'Threads authorization was not completed',
      });
    }

    this.assertCredentialEncryptionConfigured();
    const provider = this.clients.create();

    try {
      const shortLived = await provider.exchangeAuthorizationCode(request.code!);
      const longLived = await provider.exchangeLongLivedToken(shortLived.accessToken);
      const profile = await provider.getProfile(longLived.accessToken);

      if (shortLived.userId && shortLived.userId !== profile.id) {
        throw new BadGatewayException({
          code: 'THREADS_OAUTH_ACCOUNT_MISMATCH',
          message: 'Threads authorization account did not match the verified profile',
        });
      }

      const expiresAt = longLived.expiresInSeconds
        ? new Date(Date.now() + longLived.expiresInSeconds * 1_000).toISOString()
        : null;
      const displayName = profile.name ?? `@${profile.username}`;
      const credential = this.cipher.encrypt('THREADS', {
        accessToken: longLived.accessToken,
        ...(longLived.tokenType ? { tokenType: longLived.tokenType } : {}),
        scopes: [...threadsPublishingConnectionScopes],
        ...(expiresAt ? { expiresAt } : {}),
      });
      const connected = await this.repository.promote({
        externalAccountId: profile.id,
        displayName,
        scopes: threadsPublishingConnectionScopes,
        expiresAt,
        credential,
      });

      return {
        connected,
        initiatedByUserId: pending.userId,
      };
    } catch (error) {
      this.rethrowProviderError(error);
    }
  }

  private assertCredentialEncryptionConfigured(): void {
    try {
      parseOAuthCredentialKeyring();
    } catch {
      throw new ServiceUnavailableException({
        code: 'OAUTH_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED',
        message: 'OAuth credential encryption is not configured',
      });
    }
  }

  private rethrowProviderError(error: unknown): never {
    if (error instanceof ThreadsConnectionError) {
      throw new BadGatewayException({
        code: error.code,
        message: 'Threads provider request failed',
      });
    }
    throw error;
  }
}
