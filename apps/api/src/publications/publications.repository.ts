import { ConflictException, Injectable } from '@nestjs/common';
import {
  buildPublicationIdempotencyKey,
  type PublicationState,
  type PublishNowCommand,
} from '@recruitops/contracts';
import { DatabaseService } from '../database/database.service.js';

export const PUBLICATION_QUEUE_ENQUEUE_FAILED = 'PUBLICATION_QUEUE_ENQUEUE_FAILED';
export const PUBLICATION_STATUS_LIMIT = 50;

export interface PublishNowCommandContext {
  postVariantId: string;
  postId: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'LINKEDIN' | 'TIKTOK' | 'ZALO';
  postStatus: 'DRAFT' | 'READY' | 'ARCHIVED';
  destination: {
    id: string;
    platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'LINKEDIN' | 'TIKTOK' | 'ZALO';
    postingMode: 'API' | 'MANUAL';
    enabled: boolean;
    socialAccountId: string | null;
    socialAccount: {
      id: string;
      platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'LINKEDIN' | 'TIKTOK' | 'ZALO';
      status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
      expiresAt: Date | null;
    } | null;
  } | null;
}

export interface PublishReadinessContext {
  postVariantId: string;
  postId: string;
  platform: PublishNowCommandContext['platform'];
  postStatus: PublishNowCommandContext['postStatus'];
  destinations: readonly {
    id: string;
    platform: PublishNowCommandContext['platform'];
    type: 'PAGE' | 'PROFILE' | 'GROUP' | 'ORGANIZATION' | 'OA' | 'OTHER';
    name: string;
    socialAccountId: string;
  }[];
}

export interface PersistedPublication {
  id: string;
  postVariantId: string;
  destinationId: string;
  socialAccountId: string | null;
  state: PublicationState;
  idempotencyKey: string;
  scheduledAt: Date | null;
  lastErrorCode: string | null;
}

export interface PublicationStatusRow {
  id: string;
  postVariantId: string;
  socialAccountId: string | null;
  state: PublicationState;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  nextRetryAt: Date | null;
  retryCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: Date;
  destination: {
    id: string;
    platform: PublishNowCommandContext['platform'];
    type: 'PAGE' | 'PROFILE' | 'GROUP' | 'ORGANIZATION' | 'OA' | 'OTHER';
    name: string;
  };
}

const publicationStatusSelect = {
  id: true,
  postVariantId: true,
  socialAccountId: true,
  state: true,
  scheduledAt: true,
  publishedAt: true,
  nextRetryAt: true,
  retryCount: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  updatedAt: true,
  destination: {
    select: {
      id: true,
      platform: true,
      type: true,
      name: true,
    },
  },
} as const;

@Injectable()
export class PublicationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findReadiness(postVariantId: string, now: Date): Promise<PublishReadinessContext | null> {
    const variant = await this.database.client.postVariant.findUnique({
      where: { id: postVariantId },
      select: {
        id: true,
        postId: true,
        platform: true,
        post: { select: { status: true } },
      },
    });
    if (!variant) return null;

    const destinations = await this.database.client.destination.findMany({
      where: {
        platform: variant.platform,
        postingMode: 'API',
        enabled: true,
        socialAccount: {
          is: {
            platform: variant.platform,
            status: 'CONNECTED',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        platform: true,
        type: true,
        name: true,
        socialAccountId: true,
      },
    });

    return {
      postVariantId: variant.id,
      postId: variant.postId,
      platform: variant.platform,
      postStatus: variant.post.status,
      destinations: destinations.flatMap((destination) =>
        destination.socialAccountId
          ? [
              {
                id: destination.id,
                platform: destination.platform,
                type: destination.type,
                name: destination.name,
                socialAccountId: destination.socialAccountId,
              },
            ]
          : [],
      ),
    };
  }

  async findPublishContext(
    postVariantId: string,
    destinationId: string,
  ): Promise<PublishNowCommandContext | null> {
    const variant = await this.database.client.postVariant.findUnique({
      where: { id: postVariantId },
      select: {
        id: true,
        postId: true,
        platform: true,
        post: { select: { status: true } },
      },
    });
    if (!variant) return null;

    const destination = await this.database.client.destination.findUnique({
      where: { id: destinationId },
      select: {
        id: true,
        platform: true,
        postingMode: true,
        enabled: true,
        socialAccountId: true,
        socialAccount: {
          select: {
            id: true,
            platform: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    return {
      postVariantId: variant.id,
      postId: variant.postId,
      platform: variant.platform,
      postStatus: variant.post.status,
      destination,
    };
  }

  async upsertPublication(
    command: PublishNowCommand,
    socialAccountId: string,
    scheduledAt: Date,
  ): Promise<PersistedPublication> {
    const idempotencyKey = buildPublicationIdempotencyKey(command.publicationId);
    const publication = await this.database.client.publication.upsert({
      where: { id: command.publicationId },
      create: {
        id: command.publicationId,
        postVariantId: command.postVariantId,
        destinationId: command.destinationId,
        socialAccountId,
        state: 'PENDING',
        idempotencyKey,
        scheduledAt,
      },
      update: {},
      select: {
        id: true,
        postVariantId: true,
        destinationId: true,
        socialAccountId: true,
        state: true,
        idempotencyKey: true,
        scheduledAt: true,
        lastErrorCode: true,
      },
    });

    if (
      publication.postVariantId !== command.postVariantId ||
      publication.destinationId !== command.destinationId ||
      publication.socialAccountId !== socialAccountId ||
      publication.idempotencyKey !== idempotencyKey
    ) {
      throw new ConflictException({
        code: 'PUBLICATION_IDEMPOTENCY_CONFLICT',
        message: 'Publication ID is already associated with another publish command',
      });
    }

    return publication;
  }

  async listStatusByVariant(
    postVariantId: string,
  ): Promise<{ items: PublicationStatusRow[]; truncated: boolean }> {
    const rows = await this.database.client.publication.findMany({
      where: { postVariantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PUBLICATION_STATUS_LIMIT + 1,
      select: publicationStatusSelect,
    });

    return {
      items: rows.slice(0, PUBLICATION_STATUS_LIMIT),
      truncated: rows.length > PUBLICATION_STATUS_LIMIT,
    };
  }

  async findStatusById(publicationId: string): Promise<PublicationStatusRow | null> {
    return this.database.client.publication.findUnique({
      where: { id: publicationId },
      select: publicationStatusSelect,
    });
  }

  async prepareManualRetry(publicationId: string, expectedUpdatedAt: Date): Promise<boolean> {
    const result = await this.database.client.publication.updateMany({
      where: {
        id: publicationId,
        state: 'FAILED',
        updatedAt: expectedUpdatedAt,
      },
      data: {
        retryCount: 0,
        nextRetryAt: null,
      },
    });
    return result.count === 1;
  }

  async recordQueueEnqueueFailure(publicationId: string): Promise<void> {
    await this.database.client.publication.updateMany({
      where: { id: publicationId, state: 'PENDING' },
      data: {
        lastErrorCode: PUBLICATION_QUEUE_ENQUEUE_FAILED,
        lastErrorMessage:
          'Queue acceptance was not confirmed; retry the same publication ID to reconcile safely',
      },
    });
  }

  async clearQueueEnqueueFailure(publicationId: string): Promise<void> {
    await this.database.client.publication.updateMany({
      where: {
        id: publicationId,
        state: 'PENDING',
        lastErrorCode: PUBLICATION_QUEUE_ENQUEUE_FAILED,
      },
      data: {
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }
}
