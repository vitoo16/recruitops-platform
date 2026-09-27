import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsRepository } from './jobs.repository.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
})
export class JobsModule {}
