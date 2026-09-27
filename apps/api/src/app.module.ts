import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ContentModule } from './content/content.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    CandidatesModule,
    ContentModule,
    DatabaseModule,
    FilesModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
