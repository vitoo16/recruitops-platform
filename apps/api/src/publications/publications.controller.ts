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
export class PublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get('publish-now/readiness/:postVariantId')
  @Header('Cache-Control', 'no-store')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getPublishNowReadiness(@Param('postVariantId', new ParseUUIDPipe()) postVariantId: string) {
    return this.publications.getPublishNowReadiness(postVariantId);
  }

  @Get('status/:postVariantId')
  @Header('Cache-Control', 'no-store')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listStatus(@Param('postVariantId', new ParseUUIDPipe()) postVariantId: string) {
    return this.publications.listStatus(postVariantId);
  }

  @Post('publish-now')
  @Header('Cache-Control', 'no-store')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  publishNow(@Body() body: unknown) {
    return this.publications.publishNow(body);
  }

  @Post('schedule')
  @Header('Cache-Control', 'no-store')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  schedulePublication(@Body() body: unknown) {
    return this.publications.schedulePublication(body);
  }

  @Post(':publicationId/retry')
  @Header('Cache-Control', 'no-store')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  retryPublication(@Param('publicationId', new ParseUUIDPipe()) publicationId: string) {
    return this.publications.retryPublication(publicationId);
  }
}
