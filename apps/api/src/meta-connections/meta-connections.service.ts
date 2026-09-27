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
import {
  MetaConnectionsRepository,
  type MetaPromotionRecord,
} from './meta-connections.repository.js';
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

const MetaSelectionLookupSchema = z.object({ connectionSessionId: z.uuid() }).strict();

const FacebookSelectionSchema = z
  .object({
    platform: z.literal('FACEBOOK'),
    pageId: z.string().trim().min(1).max(255),
  })
  .strict();

const InstagramSelectionSchema = z
  .object({
    platform: z.literal('INSTAGRAM'),
    pageId: z.string().trim().min(1).max(255),
    instagramAccountId: z.string().trim().min(1).max(255),
  })
  .strict();

const MetaAccountSelectionSchema = z
  .object({
    connectionSessionId: z.uuid(),
    accounts: z
      .array(z.discriminatedUnion('platform', [FacebookSelectionSchema, InstagramSelectionSchema]))
      .min(1)
      .max(100)
      .refine(
        (accounts) =>
          new Set(
            accounts.map((account) =>
              account.platform === 'FACEBOOK'
                ? `FACEBOOK:${account.pageId}`
                : `INSTAGRAM:${account.instagramAccountId}`,
            ),
          ).size === accounts.length,
        { message: 'Selected Meta accounts must be unique' },
      ),
  })
  .strict();

type MetaAccountSelection = z.infer<typeof MetaAccountSelectionSchema>['accounts'][number];

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

function instagramDisplayName(account: {
  id: string;
  username?: string | undefined;
  name?: string | undefined;
}): string {
  return account.name ?? account.username ?? account.id;
}

@Injectable()
export class MetaConnectionsService {
  constructor(
    private readonly sessions: MetaOAuthSessionStore,
    private readonly cipher: OAuthCredentialCipher,
    private readonly clients: MetaConnectionClientFactory,
    private readonly repository: MetaConnectionsRepository,
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
      this.rethrowProviderError(error);
    }
  }

  async getSelection(userId: string, input: unknown) {
    const request = parseRequest(MetaSelectionLookupSchema, input);
    const selectionSession = await this.sessions.getSelectionForUser(
      request.connectionSessionId,
      userId,
    );
    if (!selectionSession) {
      throw new BadRequestException({
        code: 'META_OAUTH_SELECTION_INVALID_OR_EXPIRED',
        message: 'Meta account-selection session is invalid or expired',
      });
    }

    return {
      connectionSessionId: request.connectionSessionId,
      expiresAt: selectionSession.expiresAt,
      targets: selectionSession.targets,
      accounts: selectionSession.accounts,
    };
  }

  async select(userId: string, input: unknown) {
    const request = parseRequest(MetaAccountSelectionSchema, input);
    const selectionSession = await this.sessions.getSelectionForUser(
      request.connectionSessionId,
      userId,
    );
    if (!selectionSession) {
      throw new BadRequestException({
        code: 'META_OAUTH_SELECTION_INVALID_OR_EXPIRED',
        message: 'Meta account-selection session is invalid or expired',
      });
    }

    this.assertSelectionsBelongToSession(
      request.accounts,
      selectionSession.targets,
      selectionSession.accounts,
    );

    let userCredential;
    try {
      userCredential = this.cipher.decrypt(selectionSession.encryptedUserToken);
    } catch {
      throw new ServiceUnavailableException({
        code: 'META_OAUTH_SELECTION_CREDENTIAL_UNAVAILABLE',
        message: 'Temporary Meta credential cannot be decrypted',
      });
    }

    const provider = this.clients.create();

    try {
      const pages = await this.discoverPages(
        provider,
        selectionSession.targets,
        userCredential.accessToken,
      );
      const pageById = new Map(pages.map((page) => [page.id, page]));
      const promotions = request.accounts.map((account) => this.buildPromotion(account, pageById));
      const connected = await this.repository.promote(promotions);
      await this.sessions.deleteSelection(request.connectionSessionId);

      return { connected };
    } catch (error) {
      this.rethrowProviderError(error);
    }
  }

  private buildPromotion(
    account: MetaAccountSelection,
    pageById: ReadonlyMap<string, MetaDiscoveredPage>,
  ): MetaPromotionRecord {
    const page = pageById.get(account.pageId);
    if (!page) {
      throw new BadRequestException({
        code: 'META_ACCOUNT_SELECTION_STALE',
        message: 'Selected Meta account is no longer available',
      });
    }

    if (account.platform === 'FACEBOOK') {
      const scopes = buildMetaConnectionScopes(['FACEBOOK']);
      return {
        platform: 'FACEBOOK',
        externalAccountId: page.id,
        displayName: page.name,
        scopes,
        credential: this.cipher.encrypt('FACEBOOK', {
          accessToken: page.accessToken,
          tokenType: 'bearer',
          scopes: [...scopes],
        }),
        destinationType: 'PAGE',
        destinationName: page.name,
        destinationExternalId: page.id,
      };
    }

    const instagramAccount = page.instagramProfessionalAccount;
    if (!instagramAccount || instagramAccount.id !== account.instagramAccountId) {
      throw new BadRequestException({
        code: 'META_ACCOUNT_SELECTION_STALE',
        message: 'Selected Instagram Professional account is no longer linked to this Page',
      });
    }

    const scopes = buildMetaConnectionScopes(['INSTAGRAM']);
    const displayName = instagramDisplayName(instagramAccount);
    return {
      platform: 'INSTAGRAM',
      externalAccountId: instagramAccount.id,
      displayName,
      scopes,
      credential: this.cipher.encrypt('INSTAGRAM', {
        accessToken: page.accessToken,
        tokenType: 'bearer',
        scopes: [...scopes],
      }),
      destinationType: 'PROFILE',
      destinationName: displayName,
      destinationExternalId: instagramAccount.id,
    };
  }

  private assertSelectionsBelongToSession(
    selections: readonly MetaAccountSelection[],
    targets: readonly MetaConnectionTarget[],
    discoveredAccounts: readonly MetaDiscoveredAccount[],
  ): void {
    const discoveredByPageId = new Map(
      discoveredAccounts.map((account) => [account.pageId, account]),
    );

    for (const selection of selections) {
      if (!targets.includes(selection.platform)) {
        throw new BadRequestException({
          code: 'META_ACCOUNT_SELECTION_TARGET_NOT_REQUESTED',
          message: 'Selected Meta account platform was not requested during authorization',
        });
      }

      const discovered = discoveredByPageId.get(selection.pageId);
      if (!discovered) {
        throw new BadRequestException({
          code: 'META_ACCOUNT_SELECTION_NOT_DISCOVERED',
          message: 'Selected Meta account was not discovered in this authorization session',
        });
      }

      if (
        selection.platform === 'INSTAGRAM' &&
        discovered.instagramProfessionalAccount?.id !== selection.instagramAccountId
      ) {
        throw new BadRequestException({
          code: 'META_ACCOUNT_SELECTION_NOT_DISCOVERED',
          message: 'Selected Instagram Professional account was not discovered in this session',
        });
      }
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

  private rethrowProviderError(error: unknown): never {
    if (error instanceof MetaConnectionError) {
      throw new BadGatewayException({
        code: error.code,
        message: 'Meta provider request failed',
      });
    }
    throw error;
  }
}
