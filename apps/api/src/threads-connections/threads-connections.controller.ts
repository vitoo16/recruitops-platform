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
import { ThreadsConnectionReturnUrlFactory } from './threads-connection-return-url.factory.js';
import { ThreadsConnectionsService } from './threads-connections.service.js';

function isAuthorizationDenied(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'THREADS_OAUTH_DENIED'
  );
}

@Controller('integrations/threads/oauth')
export class ThreadsConnectionsController {
  constructor(
    private readonly threadsConnections: ThreadsConnectionsService,
    private readonly returnUrls: ThreadsConnectionReturnUrlFactory,
  ) {}

  @Get('accounts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.threadsConnections.list();
  }

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: AuthenticatedPrincipal) {
    this.returnUrls.assertConfigured();
    return this.threadsConnections.start(user.id);
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      await this.threadsConnections.callback(query);
      return response.redirect(303, this.returnUrls.connected());
    } catch (error) {
      if (isAuthorizationDenied(error)) {
        return response.redirect(303, this.returnUrls.denied());
      }
      throw error;
    }
  }
}
