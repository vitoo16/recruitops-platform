import {
  BadRequestException,
  Body,
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
import { MetaConnectionReturnUrlFactory } from './meta-connection-return-url.factory.js';
import { MetaConnectionsService } from './meta-connections.service.js';

function isAuthorizationDenied(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'META_OAUTH_DENIED'
  );
}

@Controller('integrations/meta/oauth')
export class MetaConnectionsController {
  constructor(
    private readonly metaConnections: MetaConnectionsService,
    private readonly returnUrls: MetaConnectionReturnUrlFactory,
  ) {}

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    this.returnUrls.assertConfigured();
    return this.metaConnections.start(user.id, body);
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      const selection = await this.metaConnections.callback(query);
      return response.redirect(303, this.returnUrls.success(selection.connectionSessionId));
    } catch (error) {
      if (isAuthorizationDenied(error)) {
        return response.redirect(303, this.returnUrls.denied());
      }
      throw error;
    }
  }

  @Get('selection/:connectionSessionId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  selection(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('connectionSessionId') connectionSessionId: string,
  ) {
    return this.metaConnections.getSelection(user.id, { connectionSessionId });
  }

  @Post('select')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  select(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    return this.metaConnections.select(user.id, body);
  }
}
