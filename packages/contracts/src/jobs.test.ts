import { describe, expect, it } from 'vitest';
import { CreateJobSchema } from './jobs.js';

describe('CreateJobSchema', () => {
  const validJob = {
    title: 'Frontend Developer',
    companyName: 'Example Company',
    description: 'Build and maintain customer-facing web experiences.',
    employmentType: 'FULL_TIME' as const,
    currency: 'vnd',
    salaryMinMinor: 12_000_000,
    salaryMaxMinor: 20_000_000,
  };

  it('normalizes currency and defaults status', () => {
    const result = CreateJobSchema.safeParse(validJob);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('VND');
      expect(result.data.status).toBe('DRAFT');
    }
  });

  it('rejects an inverted salary range', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      salaryMinMinor: 20_000_000,
      salaryMaxMinor: 12_000_000,
    });

    expect(result.success).toBe(false);
  });

  it('rejects unsafe monetary integers', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      salaryMinMinor: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result.success).toBe(false);
  });
});
