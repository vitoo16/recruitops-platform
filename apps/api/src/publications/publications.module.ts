import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PublicationQueueGateway } from './publication-queue.gateway.js';
import { PublicationsController } from './publications.controller.js';
import { PublicationsRepository } from './publications.repository.js';
import { PublicationsService } from './publications.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [PublicationsController],
  providers: [PublicationQueueGateway, PublicationsRepository, PublicationsService],
})
export class PublicationsModule {}
