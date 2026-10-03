import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommissionAllocationService } from './commission-allocation.js';
import { CommissionsController } from './commissions.controller.js';
import { CommissionsRepository } from './commissions.repository.js';
import { CommissionsService } from './commissions.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CommissionsController],
  providers: [CommissionAllocationService, CommissionsRepository, CommissionsService],
  exports: [CommissionAllocationService, CommissionsRepository, CommissionsService],
})
export class CommissionsModule {}
