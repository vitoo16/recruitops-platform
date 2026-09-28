import type { PublicationState, PrismaClient } from '@recruitops/database';
import type { PublishCommand, PublishResult, SocialPlatform, SocialPublisher } from '@recruitops/contracts';
import {
  FacebookPagePublisher,
  InstagramProfessionalPublisher,
  OAuthCredentialCipher,
  ThreadsPublisher,
  type EncryptedOAuthCredential,
  type MetaPublishingMediaSource,
  type ThreadsPublishingMediaSource,
} from '@recruitops/integrations';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicationWorkerEnv } from '@recruitops/config';
import type {
  PublicationExecutionContext,
  PublicationExecutionFailure,
  PublicationExecutionRepository,
  PublicationMediaContext,
  PublicationPublisherFactory,
} from './publication-executor.js';

const RUNNABLE_STATES: readonly PublicationState[] = ['PENDING', 'SCHEDULED', 'RETRY_WAITING'];
const SAFE_FAILURE_MESSAGE = 'Publication provider execution failed';

function executionError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function toMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Readonly<Record<string, unknown>>;
}

function toCredential(
  input:
    | {
        platform: SocialPlatform;
        keyId: string;
        algorithm: string;
        iv: Uint8Array;
        authTag: Uint8Array;
        ciphertext: Uint8Array;
      }
    | null,
): EncryptedOAuthCredential | undefined {
  if (!input) return undefined;
  if (input.algorithm !== 'aes-256-gcm') {
    throw executionError('PUBLICATION_CREDENTIAL_ALGORITHM_UNSUPPORTED');
  }
  return {
    platform: input.platform,
    keyId: input.keyId,
    algorithm: 'aes-256-gcm',
    iv: input.iv,
    authTag: input.authTag,
    ciphertext: input.ciphertext,
  };
}

export class PrismaPublicationExecutionRepository implements PublicationExecutionRepository {
  constructor(private readonly database: PrismaClient) {}

  async claim(publicationId: string): Promise<PublicationExecutionContext | null> {
    const claimed = await this.database.publication.updateMany({
      where: {
        id: publicationId,
        state: { in: [...RUNNABLE_STATES] },
      },
      data: {
        state: 'PUBLISHING',
        retryCount: { increment: 1 },
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (claimed.count === 0) return null;

    const publication = await this.database.publication.findUnique({
      where: { id: publicationId },
      include: {
        postVariant: {
          include: {
            post: {
              include: {
                mediaAssets: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
        destination: true,
        socialAccount: {
          include: { credential: true },
        },
      },
    });
    if (!publication) throw executionError('PUBLICATION_DISAPPEARED_AFTER_CLAIM');

    const media: PublicationMediaContext[] = publication.postVariant.post.mediaAssets.map(
      (asset) => ({
        id: asset.id,
        kind: asset.kind,
        storageKey: asset.storageKey,
      }),
    );

    return {
      publicationId: publication.id,
      attemptNumber: publication.retryCount,
      platform: publication.postVariant.platform,
      destinationPlatform: publication.destination.platform,
      destinationId: publication.destination.id,
      destinationExternalId: publication.destination.externalId ?? undefined,
      destinationEnabled: publication.destination.enabled,
      postingMode: publication.destination.postingMode,
      socialAccountId: publication.socialAccountId ?? undefined,
      socialAccountPlatform: publication.socialAccount?.platform,
      socialAccountStatus: publication.socialAccount?.status,
      idempotencyKey: publication.idempotencyKey,
      text: publication.postVariant.text,
      hashtags: publication.postVariant.hashtags,
      link: publication.postVariant.link ?? undefined,
      metadata: toMetadata(publication.postVariant.metadata),
      media,
      credential: toCredential(publication.socialAccount?.credential ?? null),
    };
  }

  async markPublished(publicationId: string, result: PublishResult): Promise<void> {
    await this.database.publication.update({
      where: { id: publicationId },
      data: {
        state: 'PUBLISHED',
        publishedAt: new Date(),
        nextRetryAt: null,
        externalPostId: result.externalPostId ?? null,
        externalUrl: result.externalUrl ?? null,
        providerRequestId: result.providerRequestId ?? null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  async markProcessing(publicationId: string, result: PublishResult): Promise<void> {
    await this.database.publication.update({
      where: { id: publicationId },
      data: {
        state: 'PROCESSING',
        nextRetryAt: null,
        externalPostId: result.externalPostId ?? null,
        externalUrl: result.externalUrl ?? null,
        providerRequestId: result.providerRequestId ?? null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  async markRetryWaiting(
    publicationId: string,
    failure: PublicationExecutionFailure,
    nextRetryAt: Date,
  ): Promise<void> {
    await this.database.publication.update({
      where: { id: publicationId },
      data: {
        state: 'RETRY_WAITING',
        nextRetryAt,
        lastErrorCode: failure.code,
        lastErrorMessage: SAFE_FAILURE_MESSAGE,
      },
    });
  }

  async markFailed(
    publicationId: string,
    failure: PublicationExecutionFailure,
  ): Promise<void> {
    await this.database.publication.update({
      where: { id: publicationId },
      data: {
        state: 'FAILED',
        nextRetryAt: null,
        lastErrorCode: failure.code,
        lastErrorMessage: SAFE_FAILURE_MESSAGE,
      },
    });
  }
}

export interface ProviderMediaSigner {
  sign(storageKey: string): Promise<string>;
}

export class SupabaseProviderMediaSigner implements ProviderMediaSigner {
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly bucket: string,
    private readonly ttlSeconds: number,
    supabaseUrl: string,
    supabaseSecretKey: string,
  ) {
    this.supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  async sign(storageKey: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, this.ttlSeconds);
    if (error || !data?.signedUrl) throw executionError('PROVIDER_MEDIA_SIGNING_FAILED');

    const url = new URL(data.signedUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw executionError('PROVIDER_MEDIA_SIGNED_URL_INVALID');
    }
    return url.toString();
  }
}

function assertExecutableContext(context: PublicationExecutionContext): asserts context is PublicationExecutionContext & {
  socialAccountId: string;
  socialAccountPlatform: SocialPlatform;
  socialAccountStatus: 'CONNECTED';
  credential: EncryptedOAuthCredential;
} {
  if (!context.destinationEnabled) throw executionError('PUBLICATION_DESTINATION_DISABLED');
  if (context.postingMode !== 'API') throw executionError('PUBLICATION_DESTINATION_NOT_API');
  if (context.destinationPlatform !== context.platform) {
    throw executionError('PUBLICATION_DESTINATION_PLATFORM_MISMATCH');
  }
  if (!context.socialAccountId || !context.socialAccountPlatform) {
    throw executionError('PUBLICATION_SOCIAL_ACCOUNT_REQUIRED');
  }
  if (context.socialAccountPlatform !== context.platform) {
    throw executionError('PUBLICATION_SOCIAL_ACCOUNT_PLATFORM_MISMATCH');
  }
  if (context.socialAccountStatus !== 'CONNECTED') {
    throw executionError('PUBLICATION_SOCIAL_ACCOUNT_NOT_CONNECTED');
  }
  if (!context.credential) throw executionError('PUBLICATION_CREDENTIAL_REQUIRED');
  if (context.credential.platform !== context.platform) {
    throw executionError('PUBLICATION_CREDENTIAL_PLATFORM_MISMATCH');
  }
}

export class DefaultPublicationPublisherFactory implements PublicationPublisherFactory {
  private readonly cipher = new OAuthCredentialCipher();

  constructor(
    private readonly graphApiVersion: string,
    private readonly mediaSigner: ProviderMediaSigner,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async create(context: PublicationExecutionContext): Promise<SocialPublisher> {
    assertExecutableContext(context);
    const credential = this.cipher.decrypt(context.credential, this.env);
    const accessToken = credential.accessToken;

    const metaContextResolver = {
      resolve: async (_command: PublishCommand) => {
        if (!context.destinationExternalId) {
          throw executionError('PUBLICATION_DESTINATION_EXTERNAL_ID_REQUIRED');
        }
        if (context.platform !== 'FACEBOOK' && context.platform !== 'INSTAGRAM') {
          throw executionError('PUBLICATION_META_CONTEXT_PLATFORM_INVALID');
        }
        return {
          platform: context.platform,
          destinationExternalId: context.destinationExternalId,
          accessToken,
        };
      },
    };

    const resolveMedia = async (
      mediaIds: readonly string[],
    ): Promise<readonly (MetaPublishingMediaSource | ThreadsPublishingMediaSource)[]> => {
      const sources = [];
      for (const mediaId of mediaIds) {
        const source = context.media.find((item) => item.id === mediaId);
        if (!source) throw executionError('PUBLICATION_MEDIA_NOT_FOUND');
        if (source.kind === 'DOCUMENT') throw executionError('PUBLICATION_MEDIA_KIND_UNSUPPORTED');
        sources.push({
          mediaId: source.id,
          kind: source.kind,
          publicUrl: await this.mediaSigner.sign(source.storageKey),
        });
      }
      return sources;
    };

    if (context.platform === 'FACEBOOK') {
      return new FacebookPagePublisher(
        { graphApiVersion: this.graphApiVersion },
        metaContextResolver,
      );
    }

    if (context.platform === 'INSTAGRAM') {
      return new InstagramProfessionalPublisher(
        { graphApiVersion: this.graphApiVersion },
        metaContextResolver,
        { resolve: resolveMedia },
      );
    }

    if (context.platform === 'THREADS') {
      return new ThreadsPublisher(
        {
          resolve: async (_command: PublishCommand) => ({
            platform: 'THREADS' as const,
            accessToken,
          }),
        },
        { resolve: resolveMedia },
      );
    }

    throw executionError('PUBLICATION_PLATFORM_EXECUTOR_NOT_IMPLEMENTED');
  }
}

export function createPublicationPublisherFactory(
  env: PublicationWorkerEnv,
): DefaultPublicationPublisherFactory {
  return new DefaultPublicationPublisherFactory(
    env.META_GRAPH_API_VERSION,
    new SupabaseProviderMediaSigner(
      env.SUPABASE_STORAGE_BUCKET,
      env.PROVIDER_MEDIA_SIGNED_URL_TTL_SECONDS,
      env.SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
    ),
  );
}
