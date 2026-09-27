import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ContentService } from './content.service.js';

@Controller('posts')
@UseGuards(AuthGuard, RolesGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listPosts(@Query() query: Record<string, unknown>) {
    return this.content.listPosts(query);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getPostById(@Param('id') id: string) {
    return this.content.getPostById(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  createPost(@Body() body: unknown) {
    return this.content.createPost(body);
  }
}
