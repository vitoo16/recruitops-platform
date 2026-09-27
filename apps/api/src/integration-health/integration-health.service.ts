import { Injectable } from '@nestjs/common';
import {
  IntegrationHealthResponseSchema,
  type IntegrationAccountHealth,
  type IntegrationReconnectReason,
} from '@recruitops/contracts';
import { parseMetaOAuthEnv } from '@recruitops/config';
import { parseOAuthCredentialKeyring } from '../social-credentials/oauth-credential-cipher.js';
import {
  IntegrationHealthRepository,
  type IntegrationAccountRecord,
} from './integration-health.repository.js';

function metaRuntimeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    parseMetaOAuthEnv(env);
    parseOAuthCredentialKeyring(env);
    return true;
  } catch {
    return false;
  }
}

function reconnectReason(
  account: IntegrationAccountRecord,
  now: Date,
): IntegrationReconnectReason | undefined {
  if (!account.hasCredential) return 'MISSING_CREDENTIAL';
  if (account.status === 'REVOKED') return 'REVOKED';
  if (account.status === 'ERROR') return 'ERROR';
  if (account.status === 'EXPIRED') return 'EXPIRED';
  if (account.expiresAt && account.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return undefined;
}

function accountHealth(account: IntegrationAccountRecord, now: Date): IntegrationAccountHealth {
  const reason = reconnectReason(account, now);
  return {
    id: account.id,
    platform: account.platform,
    displayName: account.displayName,
    status: account.status,
    ...(account.expiresAt ? { expiresAt: account.expiresAt.toISOString() } : {}),
    requiresReconnect: reason !== undefined,
    ...(reason ? { reconnectReason: reason } : {}),
  };
}

@Injectable()
export class IntegrationHealthService {
  constructor(private readonly repository: IntegrationHealthRepository) {}

  async getHealth(now = new Date()) {
    const configured = metaRuntimeConfigured();
    const accounts = (await this.repository.listMetaAccounts()).map((account) =>
      accountHealth(account, now),
    );

    const status = !configured
      ? 'NOT_CONFIGURED'
      : accounts.length === 0
        ? 'DISCONNECTED'
        : accounts.some((account) => account.requiresReconnect)
          ? 'RECONNECT_REQUIRED'
          : 'HEALTHY';

    return IntegrationHealthResponseSchema.parse({
      meta: {
        provider: 'META',
        configured,
        status,
        accounts,
      },
    });
  }
}
