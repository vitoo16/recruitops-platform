import { describe, expect, it, vi } from 'vitest';
import type { PublishCommand } from '@recruitops/contracts';
import {
  ThreadsPublisher,
  ThreadsPublishingError,
  ThreadsPublishingValidationError,
} from './threads-publishing.js';

const baseCommand: PublishCommand = {
  platform: 'THREADS',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs', '#cantho'],
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createHarness(fetchFn: typeof fetch) {
  const contexts = {
    resolve: vi.fn().mockResolvedValue({
      platform: 'THREADS' as const,
      accessToken: 'threads-access-token',
    }),
  };
  const media = {
    resolve: vi.fn().mockResolvedValue([]),
  };
  const publisher = new ThreadsPublisher(contexts, media, fetchFn);
  return { publisher, contexts, media };
}

describe('ThreadsPublisher', () => {
  it('publishes a text post through create-container then publish-container without putting the token in the URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-1' }))
      .mockResolvedValueOnce(response({ id: 'thread-1' }));
    const { publisher } = createHarness(fetchMock as unknown as typeof fetch);

    await expect(publisher.publish(baseCommand)).resolves.toEqual({
      status: 'PUBLISHED',
      externalPostId: 'thread-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(createUrl.toString()).toBe('https://graph.threads.net/me/threads');
    expect(createUrl.toString()).not.toContain('threads-access-token');
    expect(new Headers(createInit.headers).get('authorization')).toBe(
      'Bearer threads-access-token',
    );
    const createBody = new URLSearchParams(String(createInit.body));
    expect(createBody.get('media_type')).toBe('TEXT');
    expect(createBody.get('text')).toBe('We are hiring\n\n#jobs #cantho');

    const [publishUrl, publishInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(publishUrl.toString()).toBe('https://graph.threads.net/me/threads_publish');
    expect(new URLSearchParams(String(publishInit.body)).get('creation_id')).toBe('container-1');
  });

  it('publishes one image using a resolved public HTTPS URL and alt text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-image' }))
      .mockResolvedValueOnce(response({ id: 'thread-image' }));
    const { publisher, media } = createHarness(fetchMock as unknown as typeof fetch);
    media.resolve.mockResolvedValue([
      {
        mediaId: '44444444-4444-4444-8444-444444444444',
        kind: 'IMAGE',
        publicUrl: 'https://cdn.example.com/recruitment.webp',
      },
    ]);

    await publisher.publish({
      ...baseCommand,
      payload: {
        ...baseCommand.payload,
        mediaIds: ['44444444-4444-4444-8444-444444444444'],
        metadata: { altText: 'Recruitment banner' },
      },
    });

    const createBody = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(createBody.get('media_type')).toBe('IMAGE');
    expect(createBody.get('image_url')).toBe('https://cdn.example.com/recruitment.webp');
    expect(createBody.get('alt_text')).toBe('Recruitment banner');
  });

  it('publishes one video using video_url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-video' }))
      .mockResolvedValueOnce(response({ id: 'thread-video' }));
    const { publisher, media } = createHarness(fetchMock as unknown as typeof fetch);
    media.resolve.mockResolvedValue([
      {
        mediaId: '55555555-5555-4555-8555-555555555555',
        kind: 'VIDEO',
        publicUrl: 'https://cdn.example.com/recruitment.mp4',
      },
    ]);

    await publisher.publish({
      ...baseCommand,
      payload: {
        ...baseCommand.payload,
        mediaIds: ['55555555-5555-4555-8555-555555555555'],
      },
    });

    const createBody = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(createBody.get('media_type')).toBe('VIDEO');
    expect(createBody.get('video_url')).toBe('https://cdn.example.com/recruitment.mp4');
  });

  it('rejects multiple media items in the single-post adapter slice', async () => {
    const { publisher } = createHarness(vi.fn() as unknown as typeof fetch);

    await expect(
      publisher.publish({
        ...baseCommand,
        payload: {
          ...baseCommand.payload,
          mediaIds: [
            '44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555',
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ThreadsPublishingValidationError);
  });

  it('rejects unsafe media URLs before contacting Threads', async () => {
    const fetchMock = vi.fn();
    const { publisher, media } = createHarness(fetchMock as unknown as typeof fetch);
    media.resolve.mockResolvedValue([
      {
        mediaId: '44444444-4444-4444-8444-444444444444',
        kind: 'IMAGE',
        publicUrl: 'http://cdn.example.com/recruitment.webp',
      },
    ]);

    await expect(
      publisher.publish({
        ...baseCommand,
        payload: {
          ...baseCommand.payload,
          mediaIds: ['44444444-4444-4444-8444-444444444444'],
        },
      }),
    ).rejects.toMatchObject<Partial<ThreadsPublishingError>>({
      code: 'THREADS_PUBLISH_MEDIA_URL_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes provider failures without copying provider response text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            code: 190,
            message: 'secret provider text that must not be propagated',
          },
        },
        401,
      ),
    );
    const { publisher } = createHarness(fetchMock as unknown as typeof fetch);

    await expect(publisher.publish(baseCommand)).rejects.toMatchObject<
      Partial<ThreadsPublishingError>
    >({
      code: 'THREADS_CREATE_CONTAINER_FAILED_PROVIDER_190',
      status: 401,
    });
  });
});
