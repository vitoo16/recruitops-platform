import {
  executePublication,
  type PublicationExecutionRepository,
  type PublicationJobHandler,
  type SocialPublisherRegistry,
} from '@recruitops/queue';

export function createPublicationJobHandler(
  repository: PublicationExecutionRepository,
  publishers: SocialPublisherRegistry,
): PublicationJobHandler {
  return async (job) => {
    await executePublication(
      {
        publicationId: job.publicationId,
        idempotencyKey: job.idempotencyKey,
      },
      repository,
      publishers,
    );
  };
}
