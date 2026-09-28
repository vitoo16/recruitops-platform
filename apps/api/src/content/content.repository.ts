import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePostInput,
  Post,
  PostListQuery,
  PostListResponse,
  PostVariantMediaSelection,
  PostVariantRecord,
  SocialPlatform,
  UpsertPostVariantInput,
} from '@recruitops/contracts';
import type {
  Post as DatabasePost,
  PostVariant as DatabasePostVariant,
} from '@recruitops/database';
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

function mapPostVariant(variant: DatabasePostVariant): PostVariantRecord {
  const metadata =
    variant.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
      ? (variant.metadata as Record<string, unknown>)
      : {};

  return {
    id: variant.id,
    postId: variant.postId,
    platform: variant.platform,
    text: variant.text,
    hashtags: variant.hashtags,
    ...(variant.link ? { link: variant.link } : {}),
    metadata,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
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

  async listVariants(postId: string): Promise<PostVariantRecord[]> {
    const post = await this.database.client.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post was not found' });
    }

    const variants = await this.database.client.postVariant.findMany({
      where: { postId },
      orderBy: [{ platform: 'asc' }],
    });
    return variants.map(mapPostVariant);
  }

  async upsertVariant(
    postId: string,
    platform: SocialPlatform,
    input: UpsertPostVariantInput,
  ): Promise<PostVariantRecord> {
    const post = await this.database.client.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post was not found' });
    }

    const variant = await this.database.client.postVariant.upsert({
      where: { postId_platform: { postId, platform } },
      create: { postId, platform, ...input },
      update: input,
    });
    return mapPostVariant(variant);
  }

  async getVariantMediaSelection(variantId: string): Promise<PostVariantMediaSelection> {
    const variant = await this.database.client.postVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        mediaSelections: {
          orderBy: { position: 'asc' },
          select: { mediaAssetId: true },
        },
      },
    });
    if (!variant) {
      throw new NotFoundException({
        code: 'POST_VARIANT_NOT_FOUND',
        message: 'Post variant was not found',
      });
    }

    return {
      variantId: variant.id,
      mediaAssetIds: variant.mediaSelections.map((selection) => selection.mediaAssetId),
    };
  }

  async replaceVariantMediaSelection(
    variantId: string,
    mediaAssetIds: readonly string[],
  ): Promise<PostVariantMediaSelection> {
    return this.database.client.$transaction(async (transaction) => {
      const variant = await transaction.postVariant.findUnique({
        where: { id: variantId },
        select: { id: true, postId: true },
      });
      if (!variant) {
        throw new NotFoundException({
          code: 'POST_VARIANT_NOT_FOUND',
          message: 'Post variant was not found',
        });
      }

      if (mediaAssetIds.length > 0) {
        const matchingAssets = await transaction.mediaAsset.findMany({
          where: {
            id: { in: [...mediaAssetIds] },
            postId: variant.postId,
          },
          select: { id: true },
        });
        if (matchingAssets.length !== mediaAssetIds.length) {
          throw new BadRequestException({
            code: 'POST_VARIANT_MEDIA_INVALID',
            message: 'Every selected media asset must belong to the variant post',
          });
        }
      }

      await transaction.postVariantMediaAsset.deleteMany({ where: { postVariantId: variant.id } });
      if (mediaAssetIds.length > 0) {
        await transaction.postVariantMediaAsset.createMany({
          data: mediaAssetIds.map((mediaAssetId, position) => ({
            postVariantId: variant.id,
            mediaAssetId,
            position,
          })),
        });
      }

      return { variantId: variant.id, mediaAssetIds: [...mediaAssetIds] };
    });
  }
}
