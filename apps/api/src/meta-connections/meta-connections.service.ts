import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SocialAccount } from '@recruitops/contracts';
import {
  getMissingMetaPermissions,
  META_INSTAGRAM_REQUIRED_PERMISSIONS,
  META_PAGE_REQUIRED_PERMISSIONS,
  MetaProviderError,
  type MetaManagedPage,
} from '@recruitops/integrations';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { OAuthCredentialStore } from '../social-credentials/oauth-credential-store.js';
import { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaOAuthStateService } from './meta-oauth-state.js';
import { MetaProviderService } from './meta-provider.service.js';

export interface MetaConnectionWarning {
  code: string;
  externalAccountId?: string;
  missingPermissions?: string[];
}

export interface MetaConnectionResult {
  connectedAccounts: SocialAccount[];
  grantedPermissions: string[];
  warnings: MetaConnectionWarning[];
}

function queryString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) {
    throw new BadRequestException({ code, message: 'Meta OAuth callback is invalid' });
  }
  return value;
}

function auditReasonCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return error instanceof Error ? error.message : 'META_OAUTH_CONNECTION_FAILED';
}

function mapAccount(account: {
  id: string;
  platform: SocialAccount['platform'];
  externalAccountId: string;
  displayName: string;
  status: SocialAccount['status'];
  scopes: string[];
  expiresAt: Date | null;
}): SocialAccount {
  return {
    id: account.id,
    platform: account.platform,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
    status: account.status,
    scopes: account.scopes,
    ...(account.expiresAt ? { expiresAt: account.expiresAt.toISOString() } : {}),
  };
}

@Injectable()
export class MetaConnectionsService {
  constructor(
    private readonly provider: MetaProviderService,
    private readonly states: MetaOAuthStateService,
    private readonly repository: MetaConnectionsRepository,
    private readonly credentials: OAuthCredentialStore,
    private readonly audit: AuditService,
  ) {}

  start(actor: AuthenticatedPrincipal | undefined) {
    if (!actor) throw new UnauthorizedException();
    const issued = this.states.issue(actor.id);
    return {
      authorizationUrl: this.provider.authorizationUrl(issued.state),
      expiresAt: issued.expiresAt,
    };
  }

  async complete(query: Record<string, unknown>): Promise<MetaConnectionResult> {
    const state = queryString(query.state, 'META_OAUTH_STATE_REQUIRED');
    const { actorId } = this.states.verify(state);

    if (typeof query.error === 'string') {
      this.audit.record({
        eventType: 'META_OAUTH_CONNECTION',
        outcome: 'DENIED',
        actorId,
        reasonCode: 'META_OAUTH_PROVIDER_DENIED',
      });
      throw new BadRequestException({
        code: 'META_OAUTH_PROVIDER_DENIED',
        message: 'Meta authorization was not completed',
      });
    }

    const code = queryString(query.code, 'META_AUTHORIZATION_CODE_REQUIRED');

    try {
      const token = await this.provider.exchangeCode(code);
      const grantedPermissions = await this.provider.grantedPermissions(token.accessToken);
      const missingPagePermissions = getMissingMetaPermissions(
        grantedPermissions,
        META_PAGE_REQUIRED_PERMISSIONS,
      );
      if (missingPagePermissions.length > 0) {
        throw new ForbiddenException({
          code: 'META_PAGE_PERMISSIONS_MISSING',
          message: 'Meta connection is missing required Page permissions',
          missingPermissions: missingPagePermissions,
        });
      }

      const pages = await this.provider.managedPages(token.accessToken);
      const result = await this.persistManagedAccounts(pages, grantedPermissions);
      if (!result.connectedAccounts.some((account) => account.platform === 'FACEBOOK')) {
        throw new UnprocessableEntityException({
          code: 'META_NO_MANAGEABLE_PAGES',
          message: 'No manageable Facebook Page access token was returned',
        });
      }

      this.audit.record({
        eventType: 'META_OAUTH_CONNECTION',
        outcome: 'SUCCESS',
        actorId,
      });
      return result;
    } catch (error) {
      this.audit.record({
        eventType: 'META_OAUTH_CONNECTION',
        outcome: 'DENIED',
        actorId,
        reasonCode: auditReasonCode(error),
      });
      if (error instanceof MetaProviderError) {
        throw new BadRequestException({
          code: error.message,
          message: 'Meta provider request failed',
          ...(error.providerCode !== undefined ? { providerCode: error.providerCode } : {}),
        });
      }
      throw error;
    }
  }

  private async persistManagedAccounts(
    pages: readonly MetaManagedPage[],
    grantedPermissions: string[],
  ): Promise<MetaConnectionResult> {
    const connectedAccounts: SocialAccount[] = [];
    const warnings: MetaConnectionWarning[] = [];
    const missingInstagramPermissions = getMissingMetaPermissions(
      grantedPermissions,
      META_INSTAGRAM_REQUIRED_PERMISSIONS,
    );
    const hasLinkedInstagramAccount = pages.some((page) => page.instagramBusinessAccount);

    if (hasLinkedInstagramAccount && missingInstagramPermissions.length > 0) {
      warnings.push({
        code: 'META_INSTAGRAM_PERMISSIONS_MISSING',
        missingPermissions: missingInstagramPermissions,
      });
    }

    for (const page of pages) {
      if (!page.accessToken) {
        warnings.push({ code: 'META_PAGE_TOKEN_MISSING', externalAccountId: page.id });
        continue;
      }

      connectedAccounts.push(
        await this.persistAccount({
          platform: 'FACEBOOK',
          externalAccountId: page.id,
          displayName: page.name,
          accessToken: page.accessToken,
          scopes: grantedPermissions,
        }),
      );

      if (page.instagramBusinessAccount && missingInstagramPermissions.length === 0) {
        const instagram = page.instagramBusinessAccount;
        connectedAccounts.push(
          await this.persistAccount({
            platform: 'INSTAGRAM',
            externalAccountId: instagram.id,
            displayName: instagram.username ?? instagram.name ?? `${page.name} Instagram`,
            accessToken: page.accessToken,
            scopes: grantedPermissions,
          }),
        );
      }
    }

    return { connectedAccounts, grantedPermissions: [...grantedPermissions].sort(), warnings };
  }

  private async persistAccount(input: {
    platform: 'FACEBOOK' | 'INSTAGRAM';
    externalAccountId: string;
    displayName: string;
    accessToken: string;
    scopes: string[];
  }): Promise<SocialAccount> {
    const pending = await this.repository.upsertPendingAccount({
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      displayName: input.displayName,
      scopes: input.scopes,
    });

    await this.credentials.save(pending.id, {
      accessToken: input.accessToken,
      tokenType: 'Bearer',
      scopes: input.scopes,
    });
    return mapAccount(await this.repository.markConnected(pending.id));
  }
}
