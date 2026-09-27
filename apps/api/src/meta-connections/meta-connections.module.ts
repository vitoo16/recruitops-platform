import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { SocialCredentialsModule } from '../social-credentials/social-credentials.module.js';
import { MetaConnectionClientFactory } from './meta-connection-client.factory.js';
import { MetaConnectionsController } from './meta-connections.controller.js';
import { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import { MetaOAuthSessionStore } from './meta-oauth-session.store.js';

@Module({
  imports: [AuthModule, DatabaseModule, RedisModule, SocialCredentialsModule],
  controllers: [MetaConnectionsController],
  providers: [
    MetaConnectionClientFactory,
    MetaConnectionsRepository,
    MetaConnectionsService,
    MetaOAuthSessionStore,
  ],
})
export class MetaConnectionsModule {}
