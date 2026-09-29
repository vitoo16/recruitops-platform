import type { PublicationStatusRecord } from '@recruitops/contracts';
import { describe, expect, it } from 'vitest';
import { localDateValue, localScheduleToIso, scheduledPublications } from './publication-schedule-utils';

function status(id: string, state: PublicationStatusRecord['state'], scheduledAt: string | null) {
  return {
    id,
    postVariantId: '22222222-2222-4222-8222-222222222222',
    socialAccountId: '55555555-5555-4555-8555-555555555555',
    state,
    destination: {
      id: '44444444-4444-4444-8444-444444444444',
      platform: 'FACEBOOK' as const,
      type: 'PAGE' as const,
      name: 'RecruitOps Page',
    },
    scheduledAt,
    publishedAt: null,
    nextRetryAt: null,
    retryCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: '2026-09-29T03:00:00.000Z',
    canRetry: false,
    retryBlockReason: null,
  } satisfies PublicationStatusRecord;
}

describe('publication schedule utilities', () => {
  it('formats a local calendar date without UTC shifting it', () => {
    expect(localDateValue(new Date(2026, 8, 29, 23, 45))).toBe('2026-09-29');
  });

  it('converts a valid local date and time to the same local instant represented as ISO', () => {
    const iso = localScheduleToIso('2026-09-29', '14:35');
    expect(iso).not.toBeNull();

    const parsed = new Date(iso!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(29);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(35);
  });

  it('rejects normalized invalid calendar input instead of silently changing the date', () => {
    expect(localScheduleToIso('2026-02-31', '10:00')).toBeNull();
    expect(localScheduleToIso('2026-09-29', '25:00')).toBeNull();
  });

  it('returns only scheduled publications in chronological order', () => {
    const items = [
      status('11111111-1111-4111-8111-111111111111', 'SCHEDULED', '2026-09-30T02:00:00.000Z'),
      status('22222222-1111-4111-8111-111111111111', 'PUBLISHED', '2026-09-29T02:00:00.000Z'),
      status('33333333-1111-4111-8111-111111111111', 'SCHEDULED', '2026-09-29T03:00:00.000Z'),
    ];

    expect(scheduledPublications(items).map((item) => item.id)).toEqual([
      '33333333-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });
});
