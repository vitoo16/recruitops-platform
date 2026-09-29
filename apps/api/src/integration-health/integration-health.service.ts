import { Injectable } from '@nestjs/common';
import {
  IntegrationHealthResponseSchema,
  type IntegrationAccountHealth,
  type IntegrationProviderStatus,
  type IntegrationReconnectReason,
} from '@recruitops/contracts';
import { parseMetaOAuthEnv, parseThreadsOAuthEnv } from '@recruitops/config';
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

function threadsRuntimeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    parseThreadsOAuthEnv(env);
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

function providerStatus(
  configured: boolean,
  accounts: readonly IntegrationAccountHealth[],
): IntegrationProviderStatus {
  if (!configured) return 'NOT_CONFIGURED';
  if (accounts.length === 0) return 'DISCONNECTED';
  if (accounts.some((account) => account.requiresReconnect)) return 'RECONNECT_REQUIRED';
  return 'HEALTHY';
}

@Injectable()
export class IntegrationHealthService {
  constructor(private readonly repository: IntegrationHealthRepository) {}

  async getHealth(now = new Date()) {
    const [metaRecords, threadsRecords] = await Promise.all([
      this.repository.listMetaAccounts(),
      this.repository.listThreadsAccounts(),
    ]);
    const metaAccounts = metaRecords.map((account) => accountHealth(account, now));
    const threadsAccounts = threadsRecords.map((account) => accountHealth(account, now));
    const metaConfigured = metaRuntimeConfigured();
    const threadsConfigured = threadsRuntimeConfigured();

    return IntegrationHealthResponseSchema.parse({
      meta: {
        provider: 'META',
        configured: metaConfigured,
        status: providerStatus(metaConfigured, metaAccounts),
        accounts: metaAccounts,
      },
      threads: {
        provider: 'THREADS',
        configured: threadsConfigured,
        status: providerStatus(threadsConfigured, threadsAccounts),
        accounts: threadsAccounts,
      },
    });
  }
}
