import {
  executePublication,
  type PublicationJobHandler,
  type SocialPublisherRegistry,
} from '@recruitops/queue';
import { PrismaPublicationExecutionRepository } from './publication-execution.repository.js';

export function createPublicationJobHandler(
  repository: PrismaPublicationExecutionRepository,
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
