import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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

function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const value = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isFinite(value.getTime()) && value.getTime() <= now.getTime();
}

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

  async refresh(accountId: string, now = new Date()) {
    this.assertCredentialEncryptionConfigured();
    const target = await this.repository.findRefreshTarget(accountId);
    if (!target) {
      throw new NotFoundException({
        code: 'THREADS_ACCOUNT_NOT_FOUND',
        message: 'Threads account was not found',
      });
    }

    if (target.status !== 'CONNECTED') {
      throw new BadRequestException({
        code: 'THREADS_RECONNECT_REQUIRED',
        message: 'Threads account must be reconnected before its credential can be refreshed',
      });
    }

    if (
      !target.credential ||
      !target.credentialRef ||
      !target.credentialUpdatedAt ||
      !target.scopes.includes('threads_basic')
    ) {
      await this.repository.markStatus(accountId, 'ERROR');
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_INVALID_RECONNECT_REQUIRED',
        message: 'Stored Threads credential is incomplete and must be reconnected',
      });
    }

    let payload;
    try {
      payload = this.cipher.decrypt(target.credential);
    } catch {
      await this.repository.markStatus(accountId, 'ERROR');
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_INVALID_RECONNECT_REQUIRED',
        message: 'Stored Threads credential could not be decrypted and must be reconnected',
      });
    }

    if (isExpired(target.expiresAt, now) || isExpired(payload.expiresAt, now)) {
      await this.repository.markStatus(accountId, 'EXPIRED');
      throw new BadRequestException({
        code: 'THREADS_CREDENTIAL_EXPIRED_RECONNECT_REQUIRED',
        message: 'Threads credential has expired and must be reconnected',
      });
    }

    const provider = this.clients.create();
    try {
      const refreshed = await provider.refreshLongLivedToken(payload.accessToken);
      if (!refreshed.expiresInSeconds || refreshed.expiresInSeconds <= 0) {
        throw new ThreadsConnectionError('THREADS_TOKEN_REFRESH_RESPONSE_INVALID');
      }

      const profile = await provider.getProfile(refreshed.accessToken);
      if (profile.id !== target.externalAccountId) {
        await this.repository.markStatus(accountId, 'ERROR');
        throw new BadGatewayException({
          code: 'THREADS_REFRESH_ACCOUNT_MISMATCH',
          message: 'Refreshed Threads credential did not match the connected account',
        });
      }

      const expiresAt = new Date(now.getTime() + refreshed.expiresInSeconds * 1_000).toISOString();
      const displayName = profile.name ?? `@${profile.username}`;
      const credential = this.cipher.encrypt('THREADS', {
        accessToken: refreshed.accessToken,
        ...(refreshed.tokenType || payload.tokenType
          ? { tokenType: refreshed.tokenType ?? payload.tokenType }
          : {}),
        scopes: payload.scopes.length > 0 ? payload.scopes : [...target.scopes],
        expiresAt,
      });

      await this.repository.persistRefresh({
        accountId,
        credentialRef: target.credentialRef,
        expectedCredentialUpdatedAt: target.credentialUpdatedAt,
        displayName,
        expiresAt,
        credential,
      });

      return {
        account: {
          id: accountId,
          externalAccountId: target.externalAccountId,
          displayName,
          status: 'CONNECTED' as const,
          scopes: target.scopes,
          expiresAt,
        },
        refreshedAt: now.toISOString(),
      };
    } catch (error) {
      if (error instanceof ThreadsConnectionError && this.isExpiredProviderCredential(error)) {
        await this.repository.markStatus(accountId, 'EXPIRED');
      }
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

  private isExpiredProviderCredential(error: ThreadsConnectionError): boolean {
    return error.status === 401 || error.code.includes('PROVIDER_190');
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
