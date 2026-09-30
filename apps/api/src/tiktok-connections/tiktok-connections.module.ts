import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { SocialCredentialsModule } from '../social-credentials/social-credentials.module.js';
import { TikTokConnectionClientFactory } from './tiktok-connection-client.factory.js';
import { TikTokConnectionReturnUrlFactory } from './tiktok-connection-return-url.factory.js';
import { TikTokConnectionsController } from './tiktok-connections.controller.js';
import { TikTokConnectionsRepository } from './tiktok-connections.repository.js';
import { TikTokConnectionsService } from './tiktok-connections.service.js';
import { TikTokOAuthStateStore } from './tiktok-oauth-state.store.js';
import { TikTokPublishingClientFactory } from './tiktok-publishing-client.factory.js';

@Module({
  imports: [AuthModule, DatabaseModule, RedisModule, SocialCredentialsModule],
  controllers: [TikTokConnectionsController],
  providers: [
    TikTokConnectionClientFactory,
    TikTokConnectionReturnUrlFactory,
    TikTokConnectionsRepository,
    TikTokConnectionsService,
    TikTokOAuthStateStore,
    TikTokPublishingClientFactory,
  ],
})
export class TikTokConnectionsModule {}
