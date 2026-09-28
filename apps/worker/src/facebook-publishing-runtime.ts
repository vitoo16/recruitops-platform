import type { PublishCommand, SocialPlatform, SocialPublisher } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import {
  FacebookPagePublisher,
  OAuthCredentialCipherCore,
  type MetaPublishingContext,
  type MetaPublishingContextResolver,
} from '@recruitops/integrations';
import type { SocialPublisherRegistry } from '@recruitops/queue';

export class WorkerPublishingContextError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WorkerPublishingContextError';
  }
}

function requireFacebookDestinationId(value: string | null): string {
  const normalized = value?.trim();
  if (!normalized || !/^\d{1,32}$/.test(normalized)) {
    throw new WorkerPublishingContextError('WORKER_FACEBOOK_DESTINATION_ID_INVALID');
  }
  return normalized;
}

export class PrismaFacebookPublishingContextResolver implements MetaPublishingContextResolver {
  constructor(
    private readonly database: PrismaClient,
    private readonly cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(command: PublishCommand): Promise<MetaPublishingContext> {
    if (command.platform !== 'FACEBOOK') {
      throw new WorkerPublishingContextError('WORKER_FACEBOOK_PLATFORM_MISMATCH');
    }

    const destination = await this.database.destination.findUnique({
      where: { id: command.destinationId },
      select: {
        id: true,
        platform: true,
        externalId: true,
        socialAccountId: true,
        socialAccount: {
          select: {
            id: true,
            platform: true,
            status: true,
            credential: {
              select: {
                platform: true,
                keyId: true,
                algorithm: true,
                iv: true,
                authTag: true,
                ciphertext: true,
              },
            },
          },
        },
      },
    });

    if (!destination) {
      throw new WorkerPublishingContextError('WORKER_DESTINATION_NOT_FOUND');
    }
    if (
      destination.platform !== 'FACEBOOK' ||
      destination.socialAccountId !== command.socialAccountId ||
      !destination.socialAccount ||
      destination.socialAccount.id !== command.socialAccountId ||
      destination.socialAccount.platform !== 'FACEBOOK' ||
      destination.socialAccount.status !== 'CONNECTED'
    ) {
      throw new WorkerPublishingContextError('WORKER_FACEBOOK_CONTEXT_MISMATCH');
    }

    const credential = destination.socialAccount.credential;
    if (!credential || credential.platform !== 'FACEBOOK') {
      throw new WorkerPublishingContextError('WORKER_FACEBOOK_CREDENTIAL_REQUIRED');
    }
    if (credential.algorithm !== 'aes-256-gcm') {
      throw new WorkerPublishingContextError('WORKER_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }

    const payload = this.cipher.decrypt(
      {
        platform: 'FACEBOOK',
        keyId: credential.keyId,
        algorithm: 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    return {
      platform: 'FACEBOOK',
      destinationExternalId: requireFacebookDestinationId(destination.externalId),
      accessToken: payload.accessToken,
    };
  }
}

class MapPublisherRegistry implements SocialPublisherRegistry {
  constructor(private readonly publishers: ReadonlyMap<SocialPlatform, SocialPublisher>) {}

  get(platform: SocialPlatform): SocialPublisher | undefined {
    return this.publishers.get(platform);
  }
}

export function createProductionPublisherRegistry(input: {
  database: PrismaClient;
  graphApiVersion: string;
  env?: NodeJS.ProcessEnv;
}): SocialPublisherRegistry {
  const contextResolver = new PrismaFacebookPublishingContextResolver(
    input.database,
    new OAuthCredentialCipherCore(),
    input.env,
  );
  const facebook = new FacebookPagePublisher(
    { graphApiVersion: input.graphApiVersion },
    contextResolver,
  );

  return new MapPublisherRegistry(
    new Map<SocialPlatform, SocialPublisher>([['FACEBOOK', facebook]]),
  );
}
