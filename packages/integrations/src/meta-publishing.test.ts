import type { PublishCommand } from '@recruitops/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  FacebookPagePublisher,
  InstagramProfessionalPublisher,
  MetaPublishingError,
  MetaPublishingValidationError,
  type MetaPublishingContextResolver,
  type MetaPublishingMediaResolver,
} from './meta-publishing.js';

const baseCommand: PublishCommand = {
  platform: 'FACEBOOK',
  socialAccountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  destinationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  idempotencyKey: 'publication:test',
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

function contextResolver(platform: 'FACEBOOK' | 'INSTAGRAM'): MetaPublishingContextResolver {
  return {
    resolve: vi.fn().mockResolvedValue({
      platform,
      destinationExternalId: platform === 'FACEBOOK' ? '123456' : '987654',
      accessToken: 'provider-secret-token',
    }),
  };
}

function mediaResolver(
  kind: 'IMAGE' | 'VIDEO',
  publicUrl = 'https://media.example.com/recruitment.jpg?signature=short-lived',
): MetaPublishingMediaResolver {
  return {
    resolve: vi.fn().mockResolvedValue([
      {
        mediaId: 'media-1',
        kind,
        publicUrl,
      },
    ]),
  };
}

describe('FacebookPagePublisher', () => {
  it('publishes text and link through the Page feed with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: '123456_7890' }));
    const publisher = new FacebookPagePublisher(
      { graphApiVersion: 'v26.0' },
      contextResolver('FACEBOOK'),
      fetchMock,
    );

    const result = await publisher.publish({
      ...baseCommand,
      payload: { ...baseCommand.payload, link: 'https://example.com/jobs/1' },
    });

    expect(result).toEqual({ status: 'PUBLISHED', externalPostId: '123456_7890' });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://graph.facebook.com/v26.0/123456/feed');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer provider-secret-token');
    expect(url.toString()).not.toContain('provider-secret-token');
    const body = init.body as URLSearchParams;
    expect(body.get('message')).toBe('We are hiring\n\n#jobs #cantho');
    expect(body.get('link')).toBe('https://example.com/jobs/1');
  });

  it('fails validation instead of pretending private media publishing is supported', async () => {
    const publisher = new FacebookPagePublisher(
      { graphApiVersion: 'v26.0' },
      contextResolver('FACEBOOK'),
      vi.fn(),
    );

    await expect(
      publisher.publish({
        ...baseCommand,
        payload: { ...baseCommand.payload, mediaIds: ['media-1'] },
      }),
    ).rejects.toBeInstanceOf(MetaPublishingValidationError);
  });

  it('normalizes provider errors without copying provider response text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ error: { code: 190, message: 'secret provider detail' } }, 400),
    );
    const publisher = new FacebookPagePublisher(
      { graphApiVersion: 'v26.0' },
      contextResolver('FACEBOOK'),
      fetchMock,
    );

    await expect(publisher.publish(baseCommand)).rejects.toMatchObject({
      code: 'META_FACEBOOK_PAGE_PUBLISH_FAILED_PROVIDER_190',
      status: 400,
    });
  });
});

describe('InstagramProfessionalPublisher', () => {
  it('creates and publishes a single image container using a resolved HTTPS media URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: '18270815569115548' }))
      .mockResolvedValueOnce(response({ id: '90011803596441' }));
    const publisher = new InstagramProfessionalPublisher(
      { graphApiVersion: 'v26.0' },
      contextResolver('INSTAGRAM'),
      mediaResolver('IMAGE'),
      fetchMock,
    );

    const result = await publisher.publish({
      ...baseCommand,
      platform: 'INSTAGRAM',
      payload: { ...baseCommand.payload, mediaIds: ['media-1'] },
    });

    expect(result).toEqual({
      status: 'PUBLISHED',
      externalPostId: '90011803596441',
      providerRequestId: '18270815569115548',
    });
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(createUrl.toString()).toBe('https://graph.facebook.com/v26.0/987654/media');
    expect(new Headers(createInit.headers).get('authorization')).toBe(
      'Bearer provider-secret-token',
    );
    const createBody = createInit.body as URLSearchParams;
    expect(createBody.get('image_url')).toContain('https://media.example.com/recruitment.jpg');
    expect(createBody.get('caption')).toBe('We are hiring\n\n#jobs #cantho');

    const [publishUrl, publishInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(publishUrl.toString()).toBe('https://graph.facebook.com/v26.0/987654/media_publish');
    expect((publishInit.body as URLSearchParams).get('creation_id')).toBe('18270815569115548');
  });

  it('waits for Reel processing before publishing the container', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: '18270815569115548' }))
      .mockResolvedValueOnce(response({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(response({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: '90011803596441' }));
    const publisher = new InstagramProfessionalPublisher(
      {
        graphApiVersion: 'v26.0',
        instagramContainerPollAttempts: 3,
        instagramContainerPollIntervalMs: 1,
      },
      contextResolver('INSTAGRAM'),
      mediaResolver('VIDEO', 'https://media.example.com/recruitment.mp4?signature=short-lived'),
      fetchMock,
      sleep,
    );

    await publisher.publish({
      ...baseCommand,
      platform: 'INSTAGRAM',
      payload: { ...baseCommand.payload, mediaIds: ['media-1'] },
    });

    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(firstBody.get('media_type')).toBe('REELS');
    expect(firstBody.get('video_url')).toContain('recruitment.mp4');
    expect(firstBody.get('share_to_feed')).toBe('true');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects non-HTTPS media sources before contacting Meta', async () => {
    const fetchMock = vi.fn();
    const publisher = new InstagramProfessionalPublisher(
      { graphApiVersion: 'v26.0' },
      contextResolver('INSTAGRAM'),
      mediaResolver('IMAGE', 'http://private-storage.local/media-1'),
      fetchMock,
    );

    await expect(
      publisher.publish({
        ...baseCommand,
        platform: 'INSTAGRAM',
        payload: { ...baseCommand.payload, mediaIds: ['media-1'] },
      }),
    ).rejects.toMatchObject<Partial<MetaPublishingError>>({
      code: 'META_PUBLISH_MEDIA_URL_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('times out without publishing when a Reel container never becomes ready', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: '18270815569115548' }))
      .mockResolvedValue(response({ status_code: 'IN_PROGRESS' }));
    const publisher = new InstagramProfessionalPublisher(
      {
        graphApiVersion: 'v26.0',
        instagramContainerPollAttempts: 2,
        instagramContainerPollIntervalMs: 0,
      },
      contextResolver('INSTAGRAM'),
      mediaResolver('VIDEO', 'https://media.example.com/recruitment.mp4'),
      fetchMock,
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(
      publisher.publish({
        ...baseCommand,
        platform: 'INSTAGRAM',
        payload: { ...baseCommand.payload, mediaIds: ['media-1'] },
      }),
    ).rejects.toMatchObject({ code: 'META_INSTAGRAM_CONTAINER_TIMEOUT' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
