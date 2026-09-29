import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PublicationsService } from './publications.service.js';

@Controller('publications')
@UseGuards(AuthGuard, RolesGuard)
@Header('Cache-Control', 'no-store')
export class PublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get('publish-now/readiness/:postVariantId')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getPublishNowReadiness(@Param('postVariantId', new ParseUUIDPipe()) postVariantId: string) {
    return this.publications.getPublishNowReadiness(postVariantId);
  }

  @Post('publish-now')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  publishNow(@Body() body: unknown) {
    return this.publications.publishNow(body);
  }
}
