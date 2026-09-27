import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  MetaConnectionError,
  buildMetaConnectionScopes,
  type MetaConnectionTarget,
  type MetaDiscoveredPage,
} from '@recruitops/integrations';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import {
  OAuthCredentialCipher,
  parseOAuthCredentialKeyring,
} from '../social-credentials/oauth-credential-cipher.js';
import { MetaConnectionClientFactory } from './meta-connection-client.factory.js';
import { MetaOAuthSessionStore, type MetaDiscoveredAccount } from './meta-oauth-session.store.js';

const MetaConnectionTargetSchema = z.enum(['FACEBOOK', 'INSTAGRAM']);
const MetaOAuthStartSchema = z
  .object({
    targets: z
      .array(MetaConnectionTargetSchema)
      .min(1)
      .max(2)
      .refine((targets) => new Set(targets).size === targets.length, {
        message: 'Connection targets must be unique',
      }),
  })
  .strict();

const MetaOAuthCallbackSchema = z
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

function sanitizePage(page: MetaDiscoveredPage): MetaDiscoveredAccount {
  return {
    pageId: page.id,
    pageName: page.name,
    tasks: [...page.tasks],
    instagramProfessionalAccount: page.instagramProfessionalAccount
      ? {
          id: page.instagramProfessionalAccount.id,
          ...(page.instagramProfessionalAccount.username
            ? { username: page.instagramProfessionalAccount.username }
            : {}),
          ...(page.instagramProfessionalAccount.name
            ? { name: page.instagramProfessionalAccount.name }
            : {}),
        }
      : null,
  };
}

@Injectable()
export class MetaConnectionsService {
  constructor(
    private readonly sessions: MetaOAuthSessionStore,
    private readonly cipher: OAuthCredentialCipher,
    private readonly clients: MetaConnectionClientFactory,
  ) {}

  async start(userId: string, input: unknown) {
    const request = parseRequest(MetaOAuthStartSchema, input);
    this.assertCredentialEncryptionConfigured();
    const provider = this.clients.create();
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = provider.buildAuthorizationUrl({
      state,
      targets: request.targets,
    });
    const session = await this.sessions.createPending({
      state,
      userId,
      targets: request.targets,
    });

    return {
      authorizationUrl,
      expiresAt: session.expiresAt,
    };
  }

  async callback(query: unknown) {
    const request = parseRequest(MetaOAuthCallbackSchema, query);
    const pending = await this.sessions.consumePending(request.state);
    if (!pending) {
      throw new BadRequestException({
        code: 'META_OAUTH_STATE_INVALID_OR_EXPIRED',
        message: 'Meta OAuth state is invalid, expired, or already used',
      });
    }

    if (request.error) {
      throw new BadRequestException({
        code: 'META_OAUTH_DENIED',
        message: 'Meta authorization was not completed',
      });
    }

    const provider = this.clients.create();

    try {
      const shortLivedToken = await provider.exchangeAuthorizationCode(request.code!);
      const longLivedToken = await provider.exchangeLongLivedUserToken(shortLivedToken.accessToken);
      const pages = await this.discoverPages(provider, pending.targets, longLivedToken.accessToken);
      const accounts = pages.map(sanitizePage);
      const scopes = buildMetaConnectionScopes(pending.targets);
      const tokenExpiresAt = longLivedToken.expiresInSeconds
        ? new Date(Date.now() + longLivedToken.expiresInSeconds * 1_000).toISOString()
        : undefined;
      const encryptedUserToken = this.cipher.encrypt('FACEBOOK', {
        accessToken: longLivedToken.accessToken,
        ...(longLivedToken.tokenType ? { tokenType: longLivedToken.tokenType } : {}),
        scopes: [...scopes],
        ...(tokenExpiresAt ? { expiresAt: tokenExpiresAt } : {}),
      });
      const selection = await this.sessions.createSelection({
        userId: pending.userId,
        targets: pending.targets,
        encryptedUserToken,
        accounts,
      });

      return {
        connectionSessionId: selection.connectionSessionId,
        expiresAt: selection.expiresAt,
        targets: pending.targets,
        accounts,
      };
    } catch (error) {
      if (error instanceof MetaConnectionError) {
        throw new BadGatewayException({
          code: error.code,
          message: 'Meta provider request failed',
        });
      }
      throw error;
    }
  }

  private async discoverPages(
    provider: ReturnType<MetaConnectionClientFactory['create']>,
    targets: readonly MetaConnectionTarget[],
    userAccessToken: string,
  ): Promise<readonly MetaDiscoveredPage[]> {
    if (targets.includes('INSTAGRAM')) {
      return provider.discoverAccounts(userAccessToken);
    }

    const pages = await provider.listManagedPages(userAccessToken);
    return pages.map((page) => ({
      ...page,
      instagramProfessionalAccount: null,
    }));
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
}
