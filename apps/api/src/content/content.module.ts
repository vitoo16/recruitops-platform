import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ContentController } from './content.controller.js';
import { ContentRepository } from './content.repository.js';
import { ContentService } from './content.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ContentController],
  providers: [ContentRepository, ContentService],
})
export class ContentModule {}
