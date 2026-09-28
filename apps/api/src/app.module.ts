import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ContentModule } from './content/content.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health/health.controller.js';
import { IntegrationHealthModule } from './integration-health/integration-health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MetaConnectionsModule } from './meta-connections/meta-connections.module.js';
import { SocialCredentialsModule } from './social-credentials/social-credentials.module.js';
import { ThreadsConnectionsModule } from './threads-connections/threads-connections.module.js';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    CandidatesModule,
    ContentModule,
    DatabaseModule,
    FilesModule,
    IntegrationHealthModule,
    JobsModule,
    MetaConnectionsModule,
    SocialCredentialsModule,
    ThreadsConnectionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
