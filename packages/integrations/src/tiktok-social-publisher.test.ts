import type { PublishCommand } from '@recruitops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TikTokPublishingProvider } from './tiktok-publishing.js';
import {
  TikTokDirectPostPublisher,
  TikTokSocialPublisherError,
  TikTokSocialPublisherValidationError,
} from './tiktok-social-publisher.js';

const command: PublishCommand = {
  platform: 'TIKTOK',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs'],
    mediaIds: ['44444444-4444-4444-8444-444444444444'],
    metadata: {
      tiktok: {
        consentConfirmed: true,
        privacyLevel: 'SELF_ONLY',
        disableComment: true,
        disableDuet: true,
        disableStitch: true,
      },
    },
  },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createPublisher(input?: { creatorCommentDisabled?: boolean }) {
  const contexts = {
    resolve: vi.fn().mockResolvedValue({
      platform: 'TIKTOK' as const,
      accessToken: 'tiktok-access-token',
    }),
  };
  const media = {
    resolve: vi.fn().mockResolvedValue([
      {
        mediaId: '44444444-4444-4444-8444-444444444444',
        kind: 'VIDEO' as const,
        publicUrl: 'https://example.supabase.co/storage/video.mp4?token=signed',
        mimeType: 'video/mp4',
        sizeBytes: 4,
      },
    ]),
  };
  const providerFetch = vi.fn<typeof fetch>(async (request) => {
    const url = String(request);
    if (url.includes('/creator_info/query/')) {
      return jsonResponse({
        data: {
          creator_username: 'creator',
          creator_nickname: 'Creator',
          privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'],
          comment_disabled: input?.creatorCommentDisabled ?? false,
          duet_disabled: false,
          stitch_disabled: false,
          max_video_post_duration_sec: 300,
        },
        error: { code: 'ok' },
      });
    }
    if (url.includes('/video/init/')) {
      return jsonResponse({
        data: {
          publish_id: 'v_pub_file~v2.123456789',
          upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=123',
        },
        error: { code: 'ok' },
      });
    }
    if (url.includes('open-upload.tiktokapis.com')) {
      return new Response(null, { status: 200 });
    }
    throw new Error(`unexpected provider URL: ${url}`);
  });
  const mediaFetch = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    }),
  );
  const publisher = new TikTokDirectPostPublisher(
    contexts,
    media,
    new TikTokPublishingProvider(providerFetch),
    mediaFetch,
  );
  return { publisher, contexts, media, providerFetch, mediaFetch };
}

describe('TikTokDirectPostPublisher', () => {
  it('queries creator settings and uploads one private MP4 through FILE_UPLOAD', async () => {
    const { publisher, contexts, media, providerFetch, mediaFetch } = createPublisher();

    await expect(publisher.publish(command)).resolves.toEqual({
      status: 'PROCESSING',
      externalPostId: 'v_pub_file~v2.123456789',
    });
    expect(contexts.resolve).toHaveBeenCalledWith(command);
    expect(media.resolve).toHaveBeenCalledWith(command.payload.mediaIds);
    expect(mediaFetch).toHaveBeenCalledTimes(1);
    expect(providerFetch).toHaveBeenCalledTimes(3);

    const initCall = providerFetch.mock.calls.find(([request]) =>
      String(request).includes('/video/init/'),
    );
    const body = JSON.parse(String(initCall?.[1]?.body));
    expect(body).toMatchObject({
      post_info: {
        title: 'We are hiring\n\n#jobs',
        privacy_level: 'SELF_ONLY',
        disable_comment: true,
        disable_duet: true,
        disable_stitch: true,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 4,
        chunk_size: 4,
        total_chunk_count: 1,
      },
    });
  });

  it('rejects a post without explicit TikTok consent and privacy settings', async () => {
    const { publisher, contexts } = createPublisher();
    const invalid = {
      ...command,
      payload: { ...command.payload, metadata: {} },
    } satisfies PublishCommand;

    await expect(publisher.publish(invalid)).rejects.toMatchObject<
      Partial<TikTokSocialPublisherValidationError>
    >({
      code: 'TIKTOK_PUBLISH_VALIDATION_FAILED',
      issues: [expect.objectContaining({ code: 'TIKTOK_EXPLICIT_SETTINGS_REQUIRED' })],
    });
    expect(contexts.resolve).not.toHaveBeenCalled();
  });

  it('fails closed when creator settings changed after the user choice', async () => {
    const { publisher } = createPublisher({ creatorCommentDisabled: true });
    const changed = {
      ...command,
      payload: {
        ...command.payload,
        metadata: {
          tiktok: {
            consentConfirmed: true,
            privacyLevel: 'SELF_ONLY',
            disableComment: false,
            disableDuet: true,
            disableStitch: true,
          },
        },
      },
    } satisfies PublishCommand;

    await expect(publisher.publish(changed)).rejects.toMatchObject<
      Partial<TikTokSocialPublisherError>
    >({ code: 'TIKTOK_COMMENTS_DISABLED_BY_CREATOR' });
  });

  it('rejects non-video media and unexpected byte counts', async () => {
    const { publisher, media } = createPublisher();
    media.resolve.mockResolvedValueOnce([
      {
        mediaId: '44444444-4444-4444-8444-444444444444',
        kind: 'IMAGE',
        publicUrl: 'https://example.supabase.co/storage/image.webp?token=signed',
        mimeType: 'image/webp',
        sizeBytes: 4,
      },
    ]);
    await expect(publisher.publish(command)).rejects.toMatchObject({
      code: 'TIKTOK_VIDEO_MEDIA_REQUIRED',
    });

    const mismatch = createPublisher();
    mismatch.media.resolve.mockResolvedValueOnce([
      {
        mediaId: '44444444-4444-4444-8444-444444444444',
        kind: 'VIDEO',
        publicUrl: 'https://example.supabase.co/storage/video.mp4?token=signed',
        mimeType: 'video/mp4',
        sizeBytes: 5,
      },
    ]);
    await expect(mismatch.publisher.publish(command)).rejects.toMatchObject({
      code: 'TIKTOK_MEDIA_SIZE_MISMATCH',
    });
  });
});
