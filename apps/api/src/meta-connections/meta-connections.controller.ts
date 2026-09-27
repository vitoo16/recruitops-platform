import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MetaConnectionsService } from './meta-connections.service.js';

@Controller('social-connections/meta')
export class MetaConnectionsStartController {
  constructor(private readonly connections: MetaConnectionsService) {}

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  start(@CurrentUser() user: AuthenticatedPrincipal | undefined) {
    return this.connections.start(user);
  }
}

@Controller('social-connections/meta')
export class MetaConnectionsCallbackController {
  constructor(private readonly connections: MetaConnectionsService) {}

  @Get('callback')
  callback(@Query() query: Record<string, unknown>) {
    return this.connections.complete(query);
  }
}
