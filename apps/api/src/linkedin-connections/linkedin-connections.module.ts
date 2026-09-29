import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { SocialCredentialsModule } from '../social-credentials/social-credentials.module.js';
import { LinkedInConnectionClientFactory } from './linkedin-connection-client.factory.js';
import { LinkedInConnectionReturnUrlFactory } from './linkedin-connection-return-url.factory.js';
import { LinkedInConnectionsController } from './linkedin-connections.controller.js';
import { LinkedInConnectionsRepository } from './linkedin-connections.repository.js';
import { LinkedInConnectionsService } from './linkedin-connections.service.js';
import { LinkedInOAuthStateStore } from './linkedin-oauth-state.store.js';

@Module({
  imports: [AuthModule, DatabaseModule, RedisModule, SocialCredentialsModule],
  controllers: [LinkedInConnectionsController],
  providers: [
    LinkedInConnectionClientFactory,
    LinkedInConnectionReturnUrlFactory,
    LinkedInConnectionsRepository,
    LinkedInConnectionsService,
    LinkedInOAuthStateStore,
  ],
})
export class LinkedInConnectionsModule {}
