import type { PublishCommand, SocialPlatform, SocialPublisher } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import {
  FacebookPagePublisher,
  InstagramProfessionalPublisher,
  LinkedInMemberPublisher,
  OAuthCredentialCipherCore,
  ThreadsPublisher,
  TikTokDirectPostPublisher,
  type LinkedInPublishingContext,
  type LinkedInPublishingContextResolver,
  type MetaPublishingContext,
  type MetaPublishingContextResolver,
  type MetaPublishingMediaResolver,
  type ThreadsPublishingContext,
  type ThreadsPublishingContextResolver,
  type ThreadsPublishingMediaResolver,
  type TikTokPublishingContext,
  type TikTokPublishingContextResolver,
  type TikTokPublishingMediaResolver,
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

function requireLinkedInPersonId(value: string | null): string {
  const normalized = value?.trim();
  if (!normalized || !/^[A-Za-z0-9_-]{1,255}$/.test(normalized)) {
    throw new WorkerPublishingContextError('WORKER_LINKEDIN_DESTINATION_ID_INVALID');
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

const THREADS_REQUIRED_SCOPES = ['threads_basic', 'threads_content_publish'] as const;

export class PrismaThreadsPublishingContextResolver implements ThreadsPublishingContextResolver {
  constructor(
    private readonly database: PrismaClient,
    private readonly cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(command: PublishCommand): Promise<ThreadsPublishingContext> {
    if (command.platform !== 'THREADS') {
      throw new WorkerPublishingContextError('WORKER_THREADS_PLATFORM_MISMATCH');
    }

    const destination = await this.database.destination.findUnique({
      where: { id: command.destinationId },
      select: {
        id: true,
        platform: true,
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
      destination.platform !== 'THREADS' ||
      destination.socialAccountId !== command.socialAccountId ||
      !destination.socialAccount ||
      destination.socialAccount.id !== command.socialAccountId ||
      destination.socialAccount.platform !== 'THREADS' ||
      destination.socialAccount.status !== 'CONNECTED'
    ) {
      throw new WorkerPublishingContextError('WORKER_THREADS_CONTEXT_MISMATCH');
    }

    for (const scope of THREADS_REQUIRED_SCOPES) {
      if (!destination.socialAccount.scopes.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_THREADS_SCOPE_REQUIRED');
      }
    }

    const credential = destination.socialAccount.credential;
    if (!credential || credential.platform !== 'THREADS') {
      throw new WorkerPublishingContextError('WORKER_THREADS_CREDENTIAL_REQUIRED');
    }
    if (credential.algorithm !== 'aes-256-gcm') {
      throw new WorkerPublishingContextError('WORKER_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }

    const payload = this.cipher.decrypt(
      {
        platform: 'THREADS',
        keyId: credential.keyId,
        algorithm: 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    for (const scope of THREADS_REQUIRED_SCOPES) {
      if (!payload.scopes?.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_THREADS_CREDENTIAL_SCOPE_REQUIRED');
      }
    }

    return {
      platform: 'THREADS',
      accessToken: payload.accessToken,
    };
  }
}

const LINKEDIN_REQUIRED_SCOPES = ['w_member_social'] as const;

export class PrismaLinkedInPublishingContextResolver implements LinkedInPublishingContextResolver {
  constructor(
    private readonly database: PrismaClient,
    private readonly cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(command: PublishCommand): Promise<LinkedInPublishingContext> {
    if (command.platform !== 'LINKEDIN') {
      throw new WorkerPublishingContextError('WORKER_LINKEDIN_PLATFORM_MISMATCH');
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
      destination.platform !== 'LINKEDIN' ||
      destination.socialAccountId !== command.socialAccountId ||
      !destination.socialAccount ||
      destination.socialAccount.id !== command.socialAccountId ||
      destination.socialAccount.platform !== 'LINKEDIN' ||
      destination.socialAccount.status !== 'CONNECTED'
    ) {
      throw new WorkerPublishingContextError('WORKER_LINKEDIN_CONTEXT_MISMATCH');
    }

    for (const scope of LINKEDIN_REQUIRED_SCOPES) {
      if (!destination.socialAccount.scopes.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_LINKEDIN_SCOPE_REQUIRED');
      }
    }

    const credential = destination.socialAccount.credential;
    if (!credential || credential.platform !== 'LINKEDIN') {
      throw new WorkerPublishingContextError('WORKER_LINKEDIN_CREDENTIAL_REQUIRED');
    }
    if (credential.algorithm !== 'aes-256-gcm') {
      throw new WorkerPublishingContextError('WORKER_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }

    const payload = this.cipher.decrypt(
      {
        platform: 'LINKEDIN',
        keyId: credential.keyId,
        algorithm: 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    for (const scope of LINKEDIN_REQUIRED_SCOPES) {
      if (!payload.scopes?.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_LINKEDIN_CREDENTIAL_SCOPE_REQUIRED');
      }
    }

    return {
      platform: 'LINKEDIN',
      authorUrn: `urn:li:person:${requireLinkedInPersonId(destination.externalId)}`,
      accessToken: payload.accessToken,
    };
  }
}

const TIKTOK_REQUIRED_SCOPES = ['video.publish'] as const;

export class PrismaTikTokPublishingContextResolver implements TikTokPublishingContextResolver {
  constructor(
    private readonly database: PrismaClient,
    private readonly cipher: OAuthCredentialCipherCore = new OAuthCredentialCipherCore(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(command: PublishCommand): Promise<TikTokPublishingContext> {
    if (command.platform !== 'TIKTOK') {
      throw new WorkerPublishingContextError('WORKER_TIKTOK_PLATFORM_MISMATCH');
    }

    const destination = await this.database.destination.findUnique({
      where: { id: command.destinationId },
      select: {
        id: true,
        platform: true,
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
      destination.platform !== 'TIKTOK' ||
      destination.socialAccountId !== command.socialAccountId ||
      !destination.socialAccount ||
      destination.socialAccount.id !== command.socialAccountId ||
      destination.socialAccount.platform !== 'TIKTOK' ||
      destination.socialAccount.status !== 'CONNECTED'
    ) {
      throw new WorkerPublishingContextError('WORKER_TIKTOK_CONTEXT_MISMATCH');
    }

    for (const scope of TIKTOK_REQUIRED_SCOPES) {
      if (!destination.socialAccount.scopes.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_TIKTOK_SCOPE_REQUIRED');
      }
    }

    const credential = destination.socialAccount.credential;
    if (!credential || credential.platform !== 'TIKTOK') {
      throw new WorkerPublishingContextError('WORKER_TIKTOK_CREDENTIAL_REQUIRED');
    }
    if (credential.algorithm !== 'aes-256-gcm') {
      throw new WorkerPublishingContextError('WORKER_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }

    const payload = this.cipher.decrypt(
      {
        platform: 'TIKTOK',
        keyId: credential.keyId,
        algorithm: 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    for (const scope of TIKTOK_REQUIRED_SCOPES) {
      if (!payload.scopes?.includes(scope)) {
        throw new WorkerPublishingContextError('WORKER_TIKTOK_CREDENTIAL_SCOPE_REQUIRED');
      }
    }

    return {
      platform: 'TIKTOK',
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
  instagramMediaResolver?: MetaPublishingMediaResolver;
  threadsMediaResolver?: ThreadsPublishingMediaResolver;
  linkedinApiVersion?: string;
  tiktokMediaResolver?: TikTokPublishingMediaResolver;
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

  if (input.threadsMediaResolver) {
    const threadsContextResolver = new PrismaThreadsPublishingContextResolver(
      input.database,
      new OAuthCredentialCipherCore(),
      input.env,
    );
    const threads = new ThreadsPublisher(threadsContextResolver, input.threadsMediaResolver);
    publishers.set('THREADS', threads);
  }

  if (input.linkedinApiVersion) {
    const linkedinContextResolver = new PrismaLinkedInPublishingContextResolver(
      input.database,
      new OAuthCredentialCipherCore(),
      input.env,
    );
    const linkedin = new LinkedInMemberPublisher(
      { apiVersion: input.linkedinApiVersion },
      linkedinContextResolver,
    );
    publishers.set('LINKEDIN', linkedin);
  }

  if (input.tiktokMediaResolver) {
    const tiktokContextResolver = new PrismaTikTokPublishingContextResolver(
      input.database,
      new OAuthCredentialCipherCore(),
      input.env,
    );
    const tiktok = new TikTokDirectPostPublisher(tiktokContextResolver, input.tiktokMediaResolver);
    publishers.set('TIKTOK', tiktok);
  }

  return new MapPublisherRegistry(publishers);
}
