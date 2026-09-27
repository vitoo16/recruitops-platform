import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
