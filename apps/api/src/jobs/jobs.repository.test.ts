import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Job as DatabaseJob } from '@recruitops/database';
import { mapDatabaseJob } from './jobs.repository.js';

const databaseJob: DatabaseJob = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Frontend Developer',
  companyName: 'Example Company',
  description: 'Build and maintain customer-facing web experiences.',
  location: null,
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  currency: 'VND',
  salaryMinMinor: 12_000_000n,
  salaryMaxMinor: 20_000_000n,
  interviewCommissionMinor: 100_000n,
  worked30DaysCommissionMinor: 1_500_000n,
  sourceRef: null,
  commissionNote: null,
  createdAt: new Date('2026-09-27T08:00:00.000Z'),
  updatedAt: new Date('2026-09-27T08:30:00.000Z'),
};

describe('mapDatabaseJob', () => {
  it('serializes BigInt money and timestamps for HTTP responses', () => {
    expect(mapDatabaseJob(databaseJob)).toEqual(
      expect.objectContaining({
        salaryMinMinor: 12_000_000,
        salaryMaxMinor: 20_000_000,
        interviewCommissionMinor: 100_000,
        worked30DaysCommissionMinor: 1_500_000,
        createdAt: '2026-09-27T08:00:00.000Z',
      }),
    );
  });

  it('rejects an unsafe stored monetary value instead of losing precision', () => {
    expect(() =>
      mapDatabaseJob({
        ...databaseJob,
        worked30DaysCommissionMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).toThrow(InternalServerErrorException);
  });
});
