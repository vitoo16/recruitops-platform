import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { SocialCredentialsModule } from '../social-credentials/social-credentials.module.js';
import { ThreadsConnectionClientFactory } from './threads-connection-client.factory.js';
import { ThreadsConnectionReturnUrlFactory } from './threads-connection-return-url.factory.js';
import { ThreadsConnectionsController } from './threads-connections.controller.js';
import { ThreadsConnectionsRepository } from './threads-connections.repository.js';
import { ThreadsConnectionsService } from './threads-connections.service.js';
import { ThreadsOAuthSessionStore } from './threads-oauth-session.store.js';

@Module({
  imports: [AuthModule, DatabaseModule, RedisModule, SocialCredentialsModule],
  controllers: [ThreadsConnectionsController],
  providers: [
    ThreadsConnectionClientFactory,
    ThreadsConnectionReturnUrlFactory,
    ThreadsConnectionsRepository,
    ThreadsConnectionsService,
    ThreadsOAuthSessionStore,
  ],
})
export class ThreadsConnectionsModule {}
