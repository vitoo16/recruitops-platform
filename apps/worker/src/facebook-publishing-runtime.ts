import type { PublishCommand, SocialPlatform, SocialPublisher } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import {
  FacebookPagePublisher,
  InstagramProfessionalPublisher,
  OAuthCredentialCipherCore,
  type MetaPublishingContext,
  type MetaPublishingContextResolver,
  type MetaPublishingMediaResolver,
} from '@recruitops/integrations';
import type { SocialPublisherRegistry } from '@recruitops/queue';

type MetaPublishingPlatform = Extract<SocialPlatform, 'FACEBOOK' | 'INSTAGRAM'>;

export class WorkerPublishingContextError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WorkerPublishingContextError';
  }
}

function requireMetaDestinationId(value: string | null, platform: MetaPublishingPlatform): string {
  const normalized = value?.trim();
  if (!normalized || !/^\d{1,32}$/.test(normalized)) {
    throw new WorkerPublishingContextError(`WORKER_${platform}_DESTINATION_ID_INVALID`);
  }
  return normalized;
}

function requiredScopes(platform: MetaPublishingPlatform): readonly string[] {
  return platform === 'INSTAGRAM' ? ['instagram_basic', 'instagram_content_publish'] : [];
}

class PrismaMetaPublishingContextResolver implements MetaPublishingContextResolver {
  constructor(
    private readonly platform: MetaPublishingPlatform,
    private readonly database: PrismaClient,
    private readonly cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(command: PublishCommand): Promise<MetaPublishingContext> {
    if (command.platform !== this.platform) {
      throw new WorkerPublishingContextError(`WORKER_${this.platform}_PLATFORM_MISMATCH`);
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
            scopes: true,
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
      destination.platform !== this.platform ||
      destination.socialAccountId !== command.socialAccountId ||
      !destination.socialAccount ||
      destination.socialAccount.id !== command.socialAccountId ||
      destination.socialAccount.platform !== this.platform ||
      destination.socialAccount.status !== 'CONNECTED'
    ) {
      throw new WorkerPublishingContextError(`WORKER_${this.platform}_CONTEXT_MISMATCH`);
    }

    for (const scope of requiredScopes(this.platform)) {
      if (!destination.socialAccount.scopes.includes(scope)) {
        throw new WorkerPublishingContextError(`WORKER_${this.platform}_SCOPE_REQUIRED`);
      }
    }

    const credential = destination.socialAccount.credential;
    if (!credential || credential.platform !== this.platform) {
      throw new WorkerPublishingContextError(`WORKER_${this.platform}_CREDENTIAL_REQUIRED`);
    }
    if (credential.algorithm !== 'aes-256-gcm') {
      throw new WorkerPublishingContextError('WORKER_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }

    const payload = this.cipher.decrypt(
      {
        platform: this.platform,
        keyId: credential.keyId,
        algorithm: 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    for (const scope of requiredScopes(this.platform)) {
      if (!payload.scopes?.includes(scope)) {
        throw new WorkerPublishingContextError(`WORKER_${this.platform}_CREDENTIAL_SCOPE_REQUIRED`);
      }
    }

    return {
      platform: this.platform,
      destinationExternalId: requireMetaDestinationId(destination.externalId, this.platform),
      accessToken: payload.accessToken,
    };
  }
}

export class PrismaFacebookPublishingContextResolver extends PrismaMetaPublishingContextResolver {
  constructor(
    database: PrismaClient,
    cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    env: NodeJS.ProcessEnv = process.env,
  ) {
    super('FACEBOOK', database, cipher, env);
  }
}

export class PrismaInstagramPublishingContextResolver extends PrismaMetaPublishingContextResolver {
  constructor(
    database: PrismaClient,
    cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    env: NodeJS.ProcessEnv = process.env,
  ) {
    super('INSTAGRAM', database, cipher, env);
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
  instagramMediaResolver?: MetaPublishingMediaResolver;
}): SocialPublisherRegistry {
  const facebookContextResolver = new PrismaFacebookPublishingContextResolver(
    input.database,
    new OAuthCredentialCipherCore(),
    input.env,
  );
  const facebook = new FacebookPagePublisher(
    { graphApiVersion: input.graphApiVersion },
    facebookContextResolver,
  );
  const publishers = new Map<SocialPlatform, SocialPublisher>([['FACEBOOK', facebook]]);

  if (input.instagramMediaResolver) {
    const instagramContextResolver = new PrismaInstagramPublishingContextResolver(
      input.database,
      new OAuthCredentialCipherCore(),
      input.env,
    );
    const instagram = new InstagramProfessionalPublisher(
      { graphApiVersion: input.graphApiVersion },
      instagramContextResolver,
      input.instagramMediaResolver,
    );
    publishers.set('INSTAGRAM', instagram);
  }

  return new MapPublisherRegistry(publishers);
}
