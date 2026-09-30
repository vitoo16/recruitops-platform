import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommissionsController } from './commissions.controller.js';
import { CommissionsRepository } from './commissions.repository.js';
import { CommissionsService } from './commissions.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CommissionsController],
  providers: [CommissionsRepository, CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
