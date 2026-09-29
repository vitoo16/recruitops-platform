import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LinkedInConnectionError,
  linkedinMemberConnectionScopes,
} from '@recruitops/integrations';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import {
  OAuthCredentialCipher,
  parseOAuthCredentialKeyring,
} from '../social-credentials/oauth-credential-cipher.js';
import { LinkedInConnectionClientFactory } from './linkedin-connection-client.factory.js';
import { LinkedInConnectionsRepository } from './linkedin-connections.repository.js';
import { LinkedInOAuthStateStore } from './linkedin-oauth-state.store.js';

const LinkedInOAuthCallbackSchema = z
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

function parseGrantedScopes(scope: string | undefined): readonly string[] {
  if (!scope) return linkedinMemberConnectionScopes;
  const scopes = scope
    .split(/[ ,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const missing = linkedinMemberConnectionScopes.filter(
    (required) => !scopes.includes(required),
  );
  if (missing.length > 0) {
    throw new BadGatewayException({
      code: 'LINKEDIN_OAUTH_REQUIRED_SCOPE_MISSING',
      message: 'LinkedIn did not grant all required member publishing scopes',
    });
  }
  return scopes;
}

@Injectable()
export class LinkedInConnectionsService {
  constructor(
    private readonly states: LinkedInOAuthStateStore,
    private readonly cipher: OAuthCredentialCipher,
    private readonly clients: LinkedInConnectionClientFactory,
    private readonly repository: LinkedInConnectionsRepository,
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
    const request = parseRequest(LinkedInOAuthCallbackSchema, query);
    const pending = await this.states.consume(request.state);
    if (!pending) {
      throw new BadRequestException({
        code: 'LINKEDIN_OAUTH_STATE_INVALID_OR_EXPIRED',
        message: 'LinkedIn OAuth state is invalid, expired, or already used',
      });
    }

    if (request.error) {
      throw new BadRequestException({
        code: 'LINKEDIN_OAUTH_DENIED',
        message: 'LinkedIn authorization was not completed',
      });
    }

    this.assertCredentialEncryptionConfigured();
    const provider = this.clients.create();

    try {
      const token = await provider.exchangeAuthorizationCode(request.code!);
      const profile = await provider.getProfile(token.accessToken);
      const scopes = parseGrantedScopes(token.scope);
      const expiresAt = new Date(
        Date.now() + token.expiresInSeconds * 1_000,
      ).toISOString();
      const displayName = profile.name ?? 'LinkedIn member';
      const credential = this.cipher.encrypt('LINKEDIN', {
        accessToken: token.accessToken,
        tokenType: 'Bearer',
        scopes: [...scopes],
        expiresAt,
      });
      const connected = await this.repository.promote({
        externalAccountId: profile.subject,
        displayName,
        scopes,
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
    if (error instanceof LinkedInConnectionError) {
      throw new BadGatewayException({
        code: error.code,
        message: 'LinkedIn provider request failed',
      });
    }
    throw error;
  }
}
