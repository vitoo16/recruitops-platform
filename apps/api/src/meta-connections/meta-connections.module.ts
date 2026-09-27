import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { SocialCredentialsModule } from '../social-credentials/social-credentials.module.js';
import {
  MetaConnectionsCallbackController,
  MetaConnectionsStartController,
} from './meta-connections.controller.js';
import { MetaConnectionsRepository } from './meta-connections.repository.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import { MetaOAuthStateService } from './meta-oauth-state.js';
import { MetaProviderService } from './meta-provider.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, SocialCredentialsModule],
  controllers: [MetaConnectionsStartController, MetaConnectionsCallbackController],
  providers: [
    MetaConnectionsService,
    MetaConnectionsRepository,
    MetaOAuthStateService,
    MetaProviderService,
  ],
})
export class MetaConnectionsModule {}
