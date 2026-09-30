import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CommissionsService } from './commissions.service.js';

@Controller('commissions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.commissions.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.commissions.getById(id);
  }
}
