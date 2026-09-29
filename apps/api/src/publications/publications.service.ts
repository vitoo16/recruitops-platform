import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PublishNowCommandSchema,
  PublishNowReadinessSchema,
  PublishNowResponseSchema,
  type PublishNowResponse,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import { PublicationQueueGateway } from './publication-queue.gateway.js';
import { PublicationsRepository, type PersistedPublication } from './publications.repository.js';

@Injectable()
export class PublicationsService {
  constructor(
    private readonly repository: PublicationsRepository,
    private readonly queue: PublicationQueueGateway,
  ) {}

  async getPublishNowReadiness(postVariantId: string, now = new Date()) {
    const context = await this.repository.findReadiness(postVariantId, now);
    if (!context) {
      throw new NotFoundException({
        code: 'POST_VARIANT_NOT_FOUND',
        message: 'Post variant was not found',
      });
    }

    const blockingReasons: ('POST_NOT_READY' | 'NO_ELIGIBLE_API_DESTINATION')[] = [];
    if (context.postStatus !== 'READY') blockingReasons.push('POST_NOT_READY');
    if (context.destinations.length === 0) blockingReasons.push('NO_ELIGIBLE_API_DESTINATION');

    return PublishNowReadinessSchema.parse({
      postVariantId: context.postVariantId,
      postId: context.postId,
      platform: context.platform,
      postStatus: context.postStatus,
      canPublish: blockingReasons.length === 0,
      blockingReasons,
      destinations: context.destinations,
    });
  }

  async publishNow(body: unknown, now = new Date()): Promise<PublishNowResponse> {
    const command = parseRequest(PublishNowCommandSchema, body);
    const context = await this.repository.findPublishContext(
      command.postVariantId,
      command.destinationId,
    );

    if (!context) {
      throw new NotFoundException({
        code: 'POST_VARIANT_NOT_FOUND',
        message: 'Post variant was not found',
      });
    }
    if (context.postStatus !== 'READY') {
      throw new BadRequestException({
        code: 'PUBLICATION_POST_NOT_READY',
        message: 'Only READY posts can enter the publication workflow',
      });
    }

    const destination = context.destination;
    if (!destination) {
      throw new NotFoundException({
        code: 'PUBLICATION_DESTINATION_NOT_FOUND',
        message: 'Publication destination was not found',
      });
    }
    if (!destination.enabled) {
      throw new BadRequestException({
        code: 'PUBLICATION_DESTINATION_DISABLED',
        message: 'Publication destination is disabled',
      });
    }
    if (destination.postingMode !== 'API') {
      throw new BadRequestException({
        code: 'PUBLICATION_DESTINATION_NOT_API',
        message: 'Publish Now only accepts API-mode destinations',
      });
    }
    if (destination.platform !== context.platform) {
      throw new BadRequestException({
        code: 'PUBLICATION_PLATFORM_MISMATCH',
        message: 'Post variant and destination platforms do not match',
      });
    }

    const socialAccount = destination.socialAccount;
    if (!destination.socialAccountId || !socialAccount) {
      throw new BadRequestException({
        code: 'PUBLICATION_SOCIAL_ACCOUNT_REQUIRED',
        message: 'API publishing requires a connected social account',
      });
    }
    if (
      socialAccount.id !== destination.socialAccountId ||
      socialAccount.platform !== context.platform
    ) {
      throw new BadRequestException({
        code: 'PUBLICATION_SOCIAL_ACCOUNT_MISMATCH',
        message: 'Destination social account does not match the publication platform',
      });
    }
    if (
      socialAccount.status !== 'CONNECTED' ||
      (socialAccount.expiresAt && socialAccount.expiresAt.getTime() <= now.getTime())
    ) {
      throw new BadRequestException({
        code: 'PUBLICATION_SOCIAL_ACCOUNT_NOT_CONNECTED',
        message: 'Destination social account must be reconnected before publishing',
      });
    }

    const publication = await this.repository.upsertPublication(command, socialAccount.id, now);

    if (publication.state === 'CANCELLED') {
      throw new ConflictException({
        code: 'PUBLICATION_IDEMPOTENCY_TERMINAL',
        message: 'Cancelled publication IDs cannot be reused for a new publish command',
      });
    }

    if (publication.state !== 'PENDING') {
      return this.response('ALREADY_ACCEPTED', publication);
    }

    const scheduledAt = publication.scheduledAt ?? now;
    try {
      await this.queue.enqueue(publication.id, scheduledAt);
      await this.repository.clearQueueEnqueueFailure(publication.id);
    } catch {
      await this.repository.recordQueueEnqueueFailure(publication.id);
      throw new ServiceUnavailableException({
        code: 'PUBLICATION_QUEUE_ENQUEUE_UNCONFIRMED',
        message:
          'Queue acceptance could not be confirmed. Retry the same publication ID to reconcile safely.',
      });
    }

    return this.response('QUEUED', { ...publication, scheduledAt });
  }

  private response(
    acceptance: 'QUEUED' | 'ALREADY_ACCEPTED',
    publication: PersistedPublication,
  ): PublishNowResponse {
    if (!publication.socialAccountId || !publication.scheduledAt) {
      throw new ConflictException({
        code: 'PUBLICATION_RECORD_INCOMPLETE',
        message: 'Publication record is missing required dispatch metadata',
      });
    }

    return PublishNowResponseSchema.parse({
      acceptance,
      publication: {
        id: publication.id,
        postVariantId: publication.postVariantId,
        destinationId: publication.destinationId,
        socialAccountId: publication.socialAccountId,
        state: publication.state,
        scheduledAt: publication.scheduledAt.toISOString(),
      },
    });
  }
}
