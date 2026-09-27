import { Injectable } from '@nestjs/common';
import type { SocialPlatform } from '@recruitops/contracts';
import { DatabaseService } from '../database/database.service.js';

export interface ConnectedAccountInput {
  platform: Extract<SocialPlatform, 'FACEBOOK' | 'INSTAGRAM'>;
  externalAccountId: string;
  displayName: string;
  scopes: string[];
}

@Injectable()
export class MetaConnectionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsertPendingAccount(input: ConnectedAccountInput) {
    return this.database.client.socialAccount.upsert({
      where: {
        platform_externalAccountId: {
          platform: input.platform,
          externalAccountId: input.externalAccountId,
        },
      },
      create: {
        platform: input.platform,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        scopes: input.scopes,
        status: 'ERROR',
      },
      update: {
        displayName: input.displayName,
        scopes: input.scopes,
        expiresAt: null,
        status: 'ERROR',
      },
    });
  }

  async markConnected(id: string) {
    return this.database.client.socialAccount.update({
      where: { id },
      data: { status: 'CONNECTED' },
    });
  }
}
