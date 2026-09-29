import { Injectable } from '@nestjs/common';
import type { SocialPlatform, SocialAccountStatus } from '@recruitops/contracts';
import { DatabaseService } from '../database/database.service.js';

export interface IntegrationAccountRecord {
  id: string;
  platform: SocialPlatform;
  displayName: string;
  status: SocialAccountStatus;
  expiresAt: Date | null;
  hasCredential: boolean;
}

@Injectable()
export class IntegrationHealthRepository {
  constructor(private readonly database: DatabaseService) {}

  async listMetaAccounts(): Promise<readonly IntegrationAccountRecord[]> {
    return this.listAccounts(['FACEBOOK', 'INSTAGRAM']);
  }

  async listThreadsAccounts(): Promise<readonly IntegrationAccountRecord[]> {
    return this.listAccounts(['THREADS']);
  }

  private async listAccounts(
    platforms: readonly SocialPlatform[],
  ): Promise<readonly IntegrationAccountRecord[]> {
    const accounts = await this.database.client.socialAccount.findMany({
      where: { platform: { in: [...platforms] } },
      orderBy: [{ platform: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        platform: true,
        displayName: true,
        status: true,
        expiresAt: true,
        credentialRef: true,
      },
    });

    return accounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      displayName: account.displayName,
      status: account.status,
      expiresAt: account.expiresAt,
      hasCredential: account.credentialRef !== null,
    }));
  }
}
