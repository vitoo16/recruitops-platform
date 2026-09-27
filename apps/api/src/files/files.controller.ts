import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { FilesService } from './files.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('files/media-assets')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  registerMediaAsset(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    return this.files.registerMediaAsset(user.id, body);
  }

  @Get('posts/:postId/media-assets')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listMediaAssets(@Param('postId') postId: string) {
    return this.files.listMediaAssets(postId);
  }

  @Post('files/candidate-documents')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  registerCandidateDocument(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown) {
    return this.files.registerCandidateDocument(user.id, body);
  }

  @Get('candidates/:candidateId/documents')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  listCandidateDocuments(@Param('candidateId') candidateId: string) {
    return this.files.listCandidateDocuments(candidateId);
  }
}
