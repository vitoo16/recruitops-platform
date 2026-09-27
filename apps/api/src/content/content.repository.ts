import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePostInput, Post, PostListQuery, PostListResponse } from '@recruitops/contracts';
import type { Post as DatabasePost } from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';

function mapDatabasePost(post: DatabasePost): Post {
  return {
    id: post.id,
    jobId: post.jobId,
    title: post.title,
    baseContent: post.baseContent,
    language: post.language as Post['language'],
    status: post.status,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

@Injectable()
export class ContentRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreatePostInput): Promise<Post> {
    const job = await this.database.client.job.findUnique({
      where: { id: input.jobId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: 'Job was not found',
      });
    }

    const post = await this.database.client.post.create({
      data: {
        jobId: input.jobId,
        title: input.title,
        baseContent: input.baseContent,
        language: input.language,
        status: input.status,
      },
    });

    return mapDatabasePost(post);
  }

  async list(query: PostListQuery): Promise<PostListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.database.client.post.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.post.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabasePost),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<Post> {
    const post = await this.database.client.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException({
        code: 'POST_NOT_FOUND',
        message: 'Post was not found',
      });
    }
    return mapDatabasePost(post);
  }
}
