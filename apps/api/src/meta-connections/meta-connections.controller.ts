import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MetaConnectionsService } from './meta-connections.service.js';

@Controller('integrations/meta/oauth')
export class MetaConnectionsController {
  constructor(private readonly metaConnections: MetaConnectionsService) {}

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  start(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    return this.metaConnections.start(user.id, body);
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  callback(@Query() query: Record<string, unknown>) {
    return this.metaConnections.callback(query);
  }

  @Post('select')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Header('Cache-Control', 'no-store')
  select(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    return this.metaConnections.select(user.id, body);
  }
}
