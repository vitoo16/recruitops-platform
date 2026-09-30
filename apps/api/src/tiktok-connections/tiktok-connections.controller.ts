import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TikTokConnectionReturnUrlFactory } from './tiktok-connection-return-url.factory.js';
import { TikTokConnectionsService } from './tiktok-connections.service.js';

function denied(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'TIKTOK_OAUTH_DENIED'
  );
}

@Controller('integrations/tiktok/oauth')
export class TikTokConnectionsController {
  constructor(
    private readonly connections: TikTokConnectionsService,
    private readonly returnUrls: TikTokConnectionReturnUrlFactory,
  ) {}

  @Get('accounts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.connections.list();
  }

  @Post('accounts/:accountId/creator-info')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  creatorInfo(@Param('accountId') accountId: string) {
    return this.connections.creatorInfo(accountId);
  }

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: AuthenticatedPrincipal) {
    this.returnUrls.assertConfigured();
    return this.connections.start(user.id);
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      await this.connections.callback(query);
      return response.redirect(303, this.returnUrls.connected());
    } catch (error) {
      if (denied(error)) return response.redirect(303, this.returnUrls.denied());
      throw error;
    }
  }
}
