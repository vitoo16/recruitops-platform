import { describe, expect, it, vi } from 'vitest';
import { TikTokPublishingProvider } from './tiktok-publishing.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const okError = { code: 'ok', message: '', log_id: 'log-1' };

describe('TikTokPublishingProvider', () => {
  it('queries and parses the current creator posting options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          creator_username: 'recruiter',
          creator_nickname: 'Recruiter',
          privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
          comment_disabled: false,
          duet_disabled: true,
          stitch_disabled: false,
          max_video_post_duration_sec: 300,
        },
        error: okError,
      }),
    );
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);

    await expect(provider.queryCreatorInfo('token')).resolves.toEqual({
      creatorUsername: 'recruiter',
      creatorNickname: 'Recruiter',
      privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: true,
      stitchDisabled: false,
      maxVideoPostDurationSeconds: 300,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://open.tiktokapis.com/v2/post/publish/creator_info/query/'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer token' }),
      }),
    );
  });

  it('initializes a FILE_UPLOAD direct post without putting the token in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          publish_id: 'v_pub_file~v2-1.123',
          upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=abc',
        },
        error: okError,
      }),
    );
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);

    await expect(
      provider.initializeVideoDirectPost('secret-token', {
        title: 'Hiring #frontend',
        privacyLevel: 'SELF_ONLY',
        disableComment: false,
        disableDuet: true,
        disableStitch: true,
        videoSize: 10_000_000,
        chunkSize: 10_000_000,
        totalChunkCount: 1,
      }),
    ).resolves.toEqual({
      publishId: 'v_pub_file~v2-1.123',
      uploadUrl: 'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=abc',
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/');
    expect(url.toString()).not.toContain('secret-token');
    expect(init.headers).toEqual(expect.objectContaining({ authorization: 'Bearer secret-token' }));
    expect(JSON.parse(String(init.body))).toEqual({
      post_info: {
        title: 'Hiring #frontend',
        privacy_level: 'SELF_ONLY',
        disable_comment: false,
        disable_duet: true,
        disable_stitch: true,
        brand_content_toggle: false,
        brand_organic_toggle: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 10_000_000,
        chunk_size: 10_000_000,
        total_chunk_count: 1,
      },
    });
  });

  it('forwards explicit commercial disclosure and AIGC flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          publish_id: 'publish-123',
          upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=abc',
        },
        error: okError,
      }),
    );
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);

    await provider.initializeVideoDirectPost('token', {
      privacyLevel: 'PUBLIC_TO_EVERYONE',
      brandContentToggle: true,
      brandOrganicToggle: true,
      isAigc: true,
      videoSize: 4,
      chunkSize: 4,
      totalChunkCount: 1,
    });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(init.body)).post_info).toEqual(
      expect.objectContaining({
        brand_content_toggle: true,
        brand_organic_toggle: true,
        is_aigc: true,
      }),
    );
  });

  it('uploads a bounded video chunk with the required content range headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await provider.uploadVideoChunk({
      uploadUrl: 'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=abc',
      contentType: 'video/mp4',
      bytes,
      firstByte: 0,
      totalSize: 4,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open-upload.tiktokapis.com/video/?upload_id=123&upload_token=abc',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'video/mp4',
          'content-length': '4',
          'content-range': 'bytes 0-3/4',
        },
      }),
    );
  });

  it('rejects provider upload URLs outside the TikTok upload domain', async () => {
    const provider = new TikTokPublishingProvider(vi.fn() as unknown as typeof fetch);
    await expect(
      provider.uploadVideoChunk({
        uploadUrl: 'https://evil.example/upload?token=stolen',
        contentType: 'video/mp4',
        bytes: new Uint8Array([1]),
        firstByte: 0,
        totalSize: 1,
      }),
    ).rejects.toMatchObject({ code: 'TIKTOK_UPLOAD_URL_INVALID' });
  });

  it('maps asynchronous completion and provider failures without copying provider messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            status: 'PUBLISH_COMPLETE',
            publicaly_available_post_id: ['7460000000000000000'],
            uploaded_bytes: 42,
          },
          error: okError,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            data: {},
            error: { code: 'access_token_invalid', message: 'sensitive provider detail' },
          },
          401,
        ),
      );
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);

    await expect(provider.getPostStatus('token', 'publish-1')).resolves.toEqual({
      status: 'PUBLISH_COMPLETE',
      publiclyAvailablePostIds: ['7460000000000000000'],
      uploadedBytes: 42,
    });
    await expect(provider.getPostStatus('token', 'publish-2')).rejects.toMatchObject({
      code: 'TIKTOK_STATUS_FAILED_PROVIDER_ACCESS_TOKEN_INVALID',
      status: 401,
    });
  });

  it('rejects an unknown privacy option from creator info instead of guessing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          creator_username: 'recruiter',
          creator_nickname: 'Recruiter',
          privacy_level_options: ['FUTURE_UNKNOWN_LEVEL'],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: false,
          max_video_post_duration_sec: 300,
        },
        error: okError,
      }),
    );
    const provider = new TikTokPublishingProvider(fetchMock as typeof fetch);

    await expect(provider.queryCreatorInfo('token')).rejects.toMatchObject({
      code: 'TIKTOK_PRIVACY_LEVEL_INVALID',
    });
  });
});
