import type { PrismaClient } from '@recruitops/database';
import type {
  MetaPublishingMediaResolver,
  MetaPublishingMediaSource,
  ThreadsPublishingMediaResolver,
} from '@recruitops/integrations';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_PRIVATE_STORAGE_BUCKET = 'recruitops-private';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const MAX_MEDIA_IDS = 20;

export class WorkerProviderMediaResolutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WorkerProviderMediaResolutionError';
  }
}

interface SignedUrlResult {
  data: { signedUrl: string } | null;
  error: unknown;
}

export interface ProviderMediaStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<SignedUrlResult>;
    };
  };
}

export interface ProviderMediaUrlSigner {
  sign(storageKey: string): Promise<string>;
}

export interface SupabaseProviderMediaSignerConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  bucket?: string;
  expiresInSeconds?: number;
}

function requireHttpsSupabaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SUPABASE_URL_INVALID');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SUPABASE_URL_INVALID');
  }
  return parsed;
}

function requireSecretKey(value: string): string {
  const normalized = value.trim();
  if (!normalized.startsWith('sb_secret_') || normalized.length < 20) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SECRET_KEY_INVALID');
  }
  return normalized;
}

function requireBucket(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_PRIVATE_STORAGE_BUCKET).trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(normalized)) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_BUCKET_INVALID');
  }
  return normalized;
}

function requireSignedUrlTtl(value: number | undefined): number {
  const ttl = value ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3_600) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_TTL_INVALID');
  }
  return ttl;
}

function parseSignedUrlTtl(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return requireSignedUrlTtl(Number(value));
}

function requireStorageKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_STORAGE_KEY_INVALID');
  }
  return normalized;
}

function requireSignedUrl(value: string, supabaseOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SIGNED_URL_INVALID');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== supabaseOrigin
  ) {
    throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SIGNED_URL_INVALID');
  }
  return parsed.toString();
}

export function readSupabaseProviderMediaSignerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupabaseProviderMediaSignerConfig {
  const supabaseUrl = requireHttpsSupabaseUrl(env.SUPABASE_URL ?? '').toString();
  const supabaseSecretKey = requireSecretKey(env.SUPABASE_SECRET_KEY ?? '');
  const bucket = requireBucket(env.STORAGE_BUCKET);
  const expiresInSeconds = requireSignedUrlTtl(
    parseSignedUrlTtl(env.PROVIDER_MEDIA_SIGNED_URL_TTL_SECONDS),
  );

  return {
    supabaseUrl,
    supabaseSecretKey,
    bucket,
    expiresInSeconds,
  };
}

export class SupabaseProviderMediaUrlSigner implements ProviderMediaUrlSigner {
  private readonly supabaseOrigin: string;
  private readonly bucket: string;
  private readonly expiresInSeconds: number;

  constructor(
    config: SupabaseProviderMediaSignerConfig,
    private readonly client: ProviderMediaStorageClient = createClient(
      requireHttpsSupabaseUrl(config.supabaseUrl).toString(),
      requireSecretKey(config.supabaseSecretKey),
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    ) as SupabaseClient as ProviderMediaStorageClient,
  ) {
    this.supabaseOrigin = requireHttpsSupabaseUrl(config.supabaseUrl).origin;
    requireSecretKey(config.supabaseSecretKey);
    this.bucket = requireBucket(config.bucket);
    this.expiresInSeconds = requireSignedUrlTtl(config.expiresInSeconds);
  }

  async sign(storageKey: string): Promise<string> {
    const result = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(requireStorageKey(storageKey), this.expiresInSeconds);

    if (result.error || !result.data?.signedUrl) {
      throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_SIGN_FAILED');
    }

    return requireSignedUrl(result.data.signedUrl, this.supabaseOrigin);
  }
}

export class PrismaProviderMediaResolver
  implements MetaPublishingMediaResolver, ThreadsPublishingMediaResolver
{
  constructor(
    private readonly database: PrismaClient,
    private readonly signer: ProviderMediaUrlSigner,
  ) {}

  async resolve(mediaIds: readonly string[]): Promise<readonly MetaPublishingMediaSource[]> {
    if (mediaIds.length === 0) return [];
    if (mediaIds.length > MAX_MEDIA_IDS) {
      throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_LIMIT_EXCEEDED');
    }
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_DUPLICATE_IDS');
    }

    const assets = await this.database.mediaAsset.findMany({
      where: { id: { in: [...mediaIds] } },
      select: {
        id: true,
        kind: true,
        storageKey: true,
      },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    return Promise.all(
      mediaIds.map(async (mediaId) => {
        const asset = assetsById.get(mediaId);
        if (!asset) {
          throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_NOT_FOUND');
        }
        if (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO') {
          throw new WorkerProviderMediaResolutionError('WORKER_PROVIDER_MEDIA_KIND_UNSUPPORTED');
        }

        return {
          mediaId,
          kind: asset.kind,
          publicUrl: await this.signer.sign(asset.storageKey),
        };
      }),
    );
  }
}

export function createSupabaseProviderMediaResolver(input: {
  database: PrismaClient;
  supabaseUrl: string;
  supabaseSecretKey: string;
  bucket?: string;
  expiresInSeconds?: number;
}): PrismaProviderMediaResolver {
  return new PrismaProviderMediaResolver(
    input.database,
    new SupabaseProviderMediaUrlSigner({
      supabaseUrl: input.supabaseUrl,
      supabaseSecretKey: input.supabaseSecretKey,
      ...(input.bucket ? { bucket: input.bucket } : {}),
      ...(input.expiresInSeconds !== undefined ? { expiresInSeconds: input.expiresInSeconds } : {}),
    }),
  );
}
