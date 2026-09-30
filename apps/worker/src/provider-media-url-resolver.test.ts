import type { PrismaClient } from '@recruitops/database';
import { describe, expect, it, vi } from 'vitest';
import {
  PrismaProviderMediaResolver,
  SupabaseProviderMediaUrlSigner,
  WorkerProviderMediaResolutionError,
  type ProviderMediaStorageClient,
} from './provider-media-url-resolver.js';

function createDatabase() {
  const findMany = vi.fn();
  const database = {
    mediaAsset: { findMany },
  } as unknown as PrismaClient;
  return { database, findMany };
}

describe('PrismaProviderMediaResolver', () => {
  it('preserves publication media order while keeping storage keys inside the worker boundary', async () => {
    const { database, findMany } = createDatabase();
    findMany.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'VIDEO',
        storageKey: 'content/post/video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024n,
      },
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'IMAGE',
        storageKey: 'content/post/image.webp',
        mimeType: 'image/webp',
        sizeBytes: 512n,
      },
    ]);
    const sign = vi
      .fn()
      .mockImplementation(
        async (storageKey: string) => `https://project.supabase.co/${storageKey}`,
      );
    const resolver = new PrismaProviderMediaResolver(database, { sign });

    await expect(
      resolver.resolve([
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ]),
    ).resolves.toEqual([
      {
        mediaId: '11111111-1111-4111-8111-111111111111',
        kind: 'IMAGE',
        publicUrl: 'https://project.supabase.co/content/post/image.webp',
        mimeType: 'image/webp',
        sizeBytes: 512,
      },
      {
        mediaId: '22222222-2222-4222-8222-222222222222',
        kind: 'VIDEO',
        publicUrl: 'https://project.supabase.co/content/post/video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
      },
    ]);
    expect(sign).toHaveBeenNthCalledWith(1, 'content/post/image.webp');
    expect(sign).toHaveBeenNthCalledWith(2, 'content/post/video.mp4');
  });

  it('fails closed when any selected media asset no longer exists', async () => {
    const { database, findMany } = createDatabase();
    findMany.mockResolvedValue([]);
    const sign = vi.fn();
    const resolver = new PrismaProviderMediaResolver(database, { sign });

    await expect(resolver.resolve(['11111111-1111-4111-8111-111111111111'])).rejects.toMatchObject({
      code: 'WORKER_PROVIDER_MEDIA_NOT_FOUND',
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects document assets before creating a bearer URL', async () => {
    const { database, findMany } = createDatabase();
    findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'DOCUMENT',
        storageKey: 'content/post/file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512n,
      },
    ]);
    const sign = vi.fn();
    const resolver = new PrismaProviderMediaResolver(database, { sign });

    await expect(resolver.resolve(['11111111-1111-4111-8111-111111111111'])).rejects.toMatchObject({
      code: 'WORKER_PROVIDER_MEDIA_KIND_UNSUPPORTED',
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects duplicate media IDs before privileged database or storage access', async () => {
    const { database, findMany } = createDatabase();
    const sign = vi.fn();
    const resolver = new PrismaProviderMediaResolver(database, { sign });
    const mediaId = '11111111-1111-4111-8111-111111111111';

    await expect(resolver.resolve([mediaId, mediaId])).rejects.toMatchObject({
      code: 'WORKER_PROVIDER_MEDIA_DUPLICATE_IDS',
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects media sizes that cannot be represented safely', async () => {
    const { database, findMany } = createDatabase();
    findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'VIDEO',
        storageKey: 'content/post/video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      },
    ]);
    const sign = vi.fn().mockResolvedValue('https://project.supabase.co/content/post/video.mp4');
    const resolver = new PrismaProviderMediaResolver(database, { sign });

    await expect(resolver.resolve(['11111111-1111-4111-8111-111111111111'])).rejects.toMatchObject({
      code: 'WORKER_PROVIDER_MEDIA_SIZE_INVALID',
    });
  });
});

describe('SupabaseProviderMediaUrlSigner', () => {
  function createStorageClient(result: { data: { signedUrl: string } | null; error: unknown }) {
    const createSignedUrl = vi.fn().mockResolvedValue(result);
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const client = { storage: { from } } as ProviderMediaStorageClient;
    return { client, from, createSignedUrl };
  }

  it('creates a short-lived URL from the private provider-media bucket', async () => {
    const { client, from, createSignedUrl } = createStorageClient({
      data: {
        signedUrl:
          'https://project.supabase.co/storage/v1/object/sign/recruitops-private/content/post/image.webp?token=opaque',
      },
      error: null,
    });
    const signer = new SupabaseProviderMediaUrlSigner(
      {
        supabaseUrl: 'https://project.supabase.co',
        supabaseSecretKey: `sb_secret_${'x'.repeat(32)}`,
        expiresInSeconds: 600,
      },
      client,
    );

    await expect(signer.sign('content/post/image.webp')).resolves.toContain(
      'https://project.supabase.co/storage/v1/object/sign/',
    );
    expect(from).toHaveBeenCalledWith('recruitops-private');
    expect(createSignedUrl).toHaveBeenCalledWith('content/post/image.webp', 600);
  });

  it('rejects signed URLs that escape the configured Supabase origin', async () => {
    const { client } = createStorageClient({
      data: { signedUrl: 'https://attacker.example/media.webp?token=opaque' },
      error: null,
    });
    const signer = new SupabaseProviderMediaUrlSigner(
      {
        supabaseUrl: 'https://project.supabase.co',
        supabaseSecretKey: `sb_secret_${'x'.repeat(32)}`,
      },
      client,
    );

    await expect(signer.sign('content/post/image.webp')).rejects.toMatchObject({
      code: 'WORKER_PROVIDER_MEDIA_SIGNED_URL_INVALID',
    });
  });

  it('rejects publishable credentials for privileged provider-media signing', () => {
    const { client } = createStorageClient({ data: null, error: null });

    expect(
      () =>
        new SupabaseProviderMediaUrlSigner(
          {
            supabaseUrl: 'https://project.supabase.co',
            supabaseSecretKey: 'sb_publishable_not_allowed',
          },
          client,
        ),
    ).toThrow(WorkerProviderMediaResolutionError);
  });
});
