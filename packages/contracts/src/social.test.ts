import { describe, expect, it } from 'vitest';
import { DestinationSchema, matchesDestinationFilter, SocialAccountSchema } from './social.js';

const destination = DestinationSchema.parse({
  id: '8636be8a-689a-44ef-b3b7-c7921a6758b4',
  platform: 'FACEBOOK',
  type: 'GROUP',
  name: 'Việc làm Cần Thơ',
  url: 'https://example.com/group/can-tho',
  postingMode: 'MANUAL',
  tags: ['Can-Tho', 'PART-TIME', 'part-time'],
});

describe('social domain contracts', () => {
  it('normalizes and deduplicates destination tags', () => {
    expect(destination.tags).toEqual(['can-tho', 'part-time']);
  });

  it('filters destinations by platform, posting mode and tags', () => {
    expect(
      matchesDestinationFilter(destination, {
        platform: 'FACEBOOK',
        postingMode: 'MANUAL',
        tags: ['PART-TIME'],
      }),
    ).toBe(true);

    expect(matchesDestinationFilter(destination, { tags: ['remote'] })).toBe(false);
  });

  it('validates social account expiry as an offset-aware ISO datetime', () => {
    const result = SocialAccountSchema.safeParse({
      id: '9bd94b4c-d842-44a9-920a-d417947e46f5',
      platform: 'LINKEDIN',
      externalAccountId: 'org-123',
      displayName: 'RecruitOps Demo',
      status: 'CONNECTED',
      scopes: ['post:write'],
      expiresAt: '2027-01-01T00:00:00+00:00',
    });

    expect(result.success).toBe(true);
  });
});
