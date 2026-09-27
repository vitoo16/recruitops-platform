import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CandidatesService } from './candidates.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get('candidates')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listCandidates(@Query() query: Record<string, unknown>) {
    return this.candidates.listCandidates(query);
  }

  @Get('candidates/duplicate-signals')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  findDuplicateSignals(@Query() query: Record<string, unknown>) {
    return this.candidates.findDuplicateSignals(query);
  }

  @Get('candidates/:id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getCandidateById(@Param('id') id: string) {
    return this.candidates.getCandidateById(id);
  }

  @Post('candidates')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  createCandidate(@Body() body: unknown) {
    return this.candidates.createCandidate(body);
  }

  @Patch('candidates/:id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  updateCandidate(@Param('id') id: string, @Body() body: unknown) {
    return this.candidates.updateCandidate(id, body);
  }

  @Get('applications')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listApplications(@Query() query: Record<string, unknown>) {
    return this.candidates.listApplications(query);
  }

  @Get('applications/:id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getApplicationById(@Param('id') id: string) {
    return this.candidates.getApplicationById(id);
  }

  @Post('applications')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  createApplication(@Body() body: unknown) {
    return this.candidates.createApplication(body);
  }

  @Patch('applications/:id/status')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  updateApplicationStatus(@Param('id') id: string, @Body() body: unknown) {
    return this.candidates.updateApplicationStatus(id, body);
  }
}
