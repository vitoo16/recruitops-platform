import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
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

  @Get('variants/:variantId/media-selection')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  getVariantMediaSelection(@Param('variantId') variantId: string) {
    return this.content.getVariantMediaSelection(variantId);
  }

  @Put('variants/:variantId/media-selection')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  replaceVariantMediaSelection(@Param('variantId') variantId: string, @Body() body: unknown) {
    return this.content.replaceVariantMediaSelection(variantId, body);
  }

  @Get(':postId/variants')
  @Roles('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER')
  listPostVariants(@Param('postId') postId: string) {
    return this.content.listPostVariants(postId);
  }

  @Put(':postId/variants/:platform')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  upsertPostVariant(
    @Param('postId') postId: string,
    @Param('platform') platform: string,
    @Body() body: unknown,
  ) {
    return this.content.upsertPostVariant(postId, platform, body);
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
