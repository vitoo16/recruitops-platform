import type { PrismaClient } from '@recruitops/database';
import type {
  PublicationExecutionPatch,
  PublicationExecutionRecord,
  PublicationExecutionRepository,
} from '@recruitops/queue';

function normalizeMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

export class PrismaPublicationExecutionRepository implements PublicationExecutionRepository {
  constructor(private readonly database: PrismaClient) {}

  async loadForExecution(publicationId: string): Promise<PublicationExecutionRecord | null> {
    const publication = await this.database.publication.findUnique({
      where: { id: publicationId },
      select: {
        id: true,
        state: true,
        retryCount: true,
        idempotencyKey: true,
        postVariant: {
          select: {
            platform: true,
            text: true,
            hashtags: true,
            link: true,
            metadata: true,
          },
        },
        destination: {
          select: {
            id: true,
            platform: true,
            postingMode: true,
            enabled: true,
            socialAccountId: true,
          },
        },
        socialAccount: {
          select: {
            id: true,
            platform: true,
            status: true,
          },
        },
      },
    });

    if (!publication) return null;

    const metadata = normalizeMetadata(publication.postVariant.metadata);
    return {
      id: publication.id,
      state: publication.state,
      retryCount: publication.retryCount,
      idempotencyKey: publication.idempotencyKey,
      platform: publication.postVariant.platform,
      destination: {
        id: publication.destination.id,
        platform: publication.destination.platform,
        postingMode: publication.destination.postingMode,
        enabled: publication.destination.enabled,
        ...(publication.destination.socialAccountId
          ? { socialAccountId: publication.destination.socialAccountId }
          : {}),
      },
      ...(publication.socialAccount
        ? {
            socialAccount: {
              id: publication.socialAccount.id,
              platform: publication.socialAccount.platform,
              status: publication.socialAccount.status,
            },
          }
        : {}),
      payload: {
        text: publication.postVariant.text,
        hashtags: publication.postVariant.hashtags,
        ...(publication.postVariant.link ? { link: publication.postVariant.link } : {}),
        ...(metadata ? { metadata } : {}),
      },
    };
  }

  async compareAndSet(
    publicationId: string,
    expectedStates: readonly PublicationExecutionRecord['state'][],
    patch: PublicationExecutionPatch,
  ): Promise<boolean> {
    const result = await this.database.publication.updateMany({
      where: {
        id: publicationId,
        state: { in: [...expectedStates] },
      },
      data: {
        state: patch.state,
        ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}),
        ...(patch.nextRetryAt !== undefined ? { nextRetryAt: patch.nextRetryAt } : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
        ...(patch.externalPostId !== undefined ? { externalPostId: patch.externalPostId } : {}),
        ...(patch.externalUrl !== undefined ? { externalUrl: patch.externalUrl } : {}),
        ...(patch.providerRequestId !== undefined
          ? { providerRequestId: patch.providerRequestId }
          : {}),
        ...(patch.lastErrorCode !== undefined ? { lastErrorCode: patch.lastErrorCode } : {}),
        ...(patch.lastErrorMessage !== undefined
          ? { lastErrorMessage: patch.lastErrorMessage }
          : {}),
      },
    });

    return result.count === 1;
  }
}
