import {
  BadRequestException,
  Controller,
  Get,
  Header,
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
import { LinkedInConnectionReturnUrlFactory } from './linkedin-connection-return-url.factory.js';
import { LinkedInConnectionsService } from './linkedin-connections.service.js';

function isAuthorizationDenied(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'LINKEDIN_OAUTH_DENIED'
  );
}

@Controller('integrations/linkedin/oauth')
export class LinkedInConnectionsController {
  constructor(
    private readonly linkedinConnections: LinkedInConnectionsService,
    private readonly returnUrls: LinkedInConnectionReturnUrlFactory,
  ) {}

  @Get('accounts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.linkedinConnections.list();
  }

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: AuthenticatedPrincipal) {
    this.returnUrls.assertConfigured();
    return this.linkedinConnections.start(user.id);
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      await this.linkedinConnections.callback(query);
      return response.redirect(303, this.returnUrls.connected());
    } catch (error) {
      if (isAuthorizationDenied(error)) {
        return response.redirect(303, this.returnUrls.denied());
      }
      throw error;
    }
  }
}
