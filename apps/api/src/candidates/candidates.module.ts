import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CommissionsModule } from '../commissions/commissions.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesRepository } from './candidates.repository.js';
import { CandidatesService } from './candidates.service.js';

@Module({
  imports: [AuthModule, CommissionsModule, DatabaseModule],
  controllers: [CandidatesController],
  providers: [CandidatesRepository, CandidatesService],
})
export class CandidatesModule {}
