import { Injectable } from '@nestjs/common';
import {
  CreatePostSchema,
  PostListQuerySchema,
  PrivateFileEntityIdSchema,
  ReplacePostVariantMediaSelectionSchema,
  SocialPlatformSchema,
  UpsertPostVariantSchema,
  type Post,
  type PostListResponse,
  type PostVariantMediaSelection,
  type PostVariantRecord,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import { ContentRepository } from './content.repository.js';

@Injectable()
export class ContentService {
  constructor(private readonly content: ContentRepository) {}

  createPost(input: unknown): Promise<Post> {
    return this.content.create(parseRequest(CreatePostSchema, input));
  }

  listPosts(query: Record<string, unknown>): Promise<PostListResponse> {
    return this.content.list(parseRequest(PostListQuerySchema, query));
  }

  getPostById(id: unknown): Promise<Post> {
    return this.content.getById(parseRequest(PrivateFileEntityIdSchema, id));
  }

  listPostVariants(postId: unknown): Promise<PostVariantRecord[]> {
    return this.content.listVariants(parseRequest(PrivateFileEntityIdSchema, postId));
  }

  upsertPostVariant(
    postId: unknown,
    platform: unknown,
    input: unknown,
  ): Promise<PostVariantRecord> {
    return this.content.upsertVariant(
      parseRequest(PrivateFileEntityIdSchema, postId),
      parseRequest(SocialPlatformSchema, platform),
      parseRequest(UpsertPostVariantSchema, input),
    );
  }

  getVariantMediaSelection(variantId: unknown): Promise<PostVariantMediaSelection> {
    return this.content.getVariantMediaSelection(
      parseRequest(PrivateFileEntityIdSchema, variantId),
    );
  }

  replaceVariantMediaSelection(
    variantId: unknown,
    input: unknown,
  ): Promise<PostVariantMediaSelection> {
    const parsedVariantId = parseRequest(PrivateFileEntityIdSchema, variantId);
    const parsed = parseRequest(ReplacePostVariantMediaSelectionSchema, input);
    return this.content.replaceVariantMediaSelection(parsedVariantId, parsed.mediaAssetIds);
  }
}
