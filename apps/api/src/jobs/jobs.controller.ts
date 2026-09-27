import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
@UseGuards(AuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  list(@Query() query: Record<string, unknown>) {
    return this.jobs.list(query);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getById(@Param('id') id: string) {
    return this.jobs.getById(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  create(@Body() body: unknown) {
    return this.jobs.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.jobs.update(id, body);
  }
}
