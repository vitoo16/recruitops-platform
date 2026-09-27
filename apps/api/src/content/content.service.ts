import { Injectable } from '@nestjs/common';
import {
  CreatePostSchema,
  PostListQuerySchema,
  PrivateFileEntityIdSchema,
  type Post,
  type PostListResponse,
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
}
