import type { PublishCommand } from '@recruitops/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  LinkedInMemberPublisher,
  LinkedInPublishingError,
  LinkedInPublishingValidationError,
} from './linkedin-publishing.js';

const command: PublishCommand = {
  platform: 'LINKEDIN',
  socialAccountId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'publication:33333333-3333-4333-8333-333333333333',
  payload: {
    text: 'We are hiring',
    hashtags: ['jobs', '#careers'],
    link: 'https://example.com/jobs',
  },
};

function createPublisher(response?: Response) {
  const contexts = {
    resolve: vi.fn().mockResolvedValue({
      platform: 'LINKEDIN' as const,
      authorUrn: 'urn:li:person:abc_123',
      accessToken: 'linkedin-member-token',
    }),
  };
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      response ??
        new Response(null, {
          status: 201,
          headers: {
            'x-restli-id': 'urn:li:share:123456789',
            'x-restli-request-id': 'request-123',
          },
        }),
    );
  return {
    publisher: new LinkedInMemberPublisher({ apiVersion: '202601' }, contexts, fetchFn),
    contexts,
    fetchFn,
  };
}

describe('LinkedInMemberPublisher', () => {
  it('creates a public member post through the versioned Posts API', async () => {
    const { publisher, contexts, fetchFn } = createPublisher();

    await expect(publisher.publish(command)).resolves.toEqual({
      status: 'PUBLISHED',
      externalPostId: 'urn:li:share:123456789',
      providerRequestId: 'request-123',
    });
    expect(contexts.resolve).toHaveBeenCalledWith(command);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer linkedin-member-token',
      'content-type': 'application/json',
      'x-restli-protocol-version': '2.0.0',
      'linkedin-version': '202601',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      author: 'urn:li:person:abc_123',
      commentary: 'We are hiring\n\n#jobs #careers\n\nhttps://example.com/jobs',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  });

  it('rejects media instead of silently dropping unsupported content', async () => {
    const { publisher, contexts, fetchFn } = createPublisher();

    await expect(
      publisher.publish({
        ...command,
        payload: {
          ...command.payload,
          mediaIds: ['44444444-4444-4444-8444-444444444444'],
        },
      }),
    ).rejects.toMatchObject<Partial<LinkedInPublishingValidationError>>({
      code: 'LINKEDIN_PUBLISH_VALIDATION_FAILED',
      issues: [expect.objectContaining({ code: 'LINKEDIN_MEDIA_NOT_SUPPORTED' })],
    });
    expect(contexts.resolve).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed when LinkedIn omits the created post URN', async () => {
    const { publisher } = createPublisher(new Response(null, { status: 201 }));

    await expect(publisher.publish(command)).rejects.toMatchObject<
      Partial<LinkedInPublishingError>
    >({
      code: 'LINKEDIN_CREATE_POST_RESPONSE_INVALID',
      status: 201,
    });
  });

  it('rejects an invalid REST API version at construction time', () => {
    expect(
      () =>
        new LinkedInMemberPublisher(
          { apiVersion: 'v202601' },
          { resolve: vi.fn() },
          vi.fn<typeof fetch>(),
        ),
    ).toThrowError(
      expect.objectContaining<Partial<LinkedInPublishingError>>({
        code: 'LINKEDIN_API_VERSION_INVALID',
      }),
    );
  });
});
