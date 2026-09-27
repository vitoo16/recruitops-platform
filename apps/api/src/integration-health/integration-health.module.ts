import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { IntegrationHealthController } from './integration-health.controller.js';
import { IntegrationHealthRepository } from './integration-health.repository.js';
import { IntegrationHealthService } from './integration-health.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [IntegrationHealthController],
  providers: [IntegrationHealthRepository, IntegrationHealthService],
})
export class IntegrationHealthModule {}
