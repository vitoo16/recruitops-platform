import { describe, expect, it } from 'vitest';
import {
  buildCandidateDedupeKeys,
  canTransitionApplicationStatus,
  CreateApplicationSchema,
  CreateCandidateSchema,
  normalizeCandidatePhone,
} from './candidates.js';

describe('candidate and application contracts', () => {
  it('requires at least one candidate contact method', () => {
    expect(
      CreateCandidateSchema.safeParse({
        fullName: 'Nguyen Van A',
      }).success,
    ).toBe(false);

    expect(
      CreateCandidateSchema.safeParse({
        fullName: 'Nguyen Van A',
        email: 'candidate@example.com',
      }).success,
    ).toBe(true);
  });

  it('builds normalized duplicate-signal keys without auto-merging records', () => {
    expect(
      buildCandidateDedupeKeys({
        email: ' Candidate@Example.COM ',
        phone: '+84 912-345-678',
      }),
    ).toEqual(['email:candidate@example.com', 'phone:+84912345678']);

    expect(normalizeCandidatePhone('0912 345 678')).toBe('0912345678');
  });

  it('validates source attribution on a new application', () => {
    const result = CreateApplicationSchema.safeParse({
      candidateId: 'e3d48d1d-9c2e-4d10-9bf4-cff8a8a91a2c',
      jobId: '1584523a-0920-46a4-a511-6ad37c006388',
      sourcePlatform: 'FACEBOOK',
      sourceDestinationId: '423412df-6a9e-46df-a5fc-34459fe47f6e',
      sourceLabel: 'Facebook recruitment group',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('SOURCED');
  });

  it('enforces the recruitment lifecycle', () => {
    expect(canTransitionApplicationStatus('SOURCED', 'SUBMITTED')).toBe(true);
    expect(canTransitionApplicationStatus('INTERVIEWED', 'HIRED')).toBe(true);
    expect(canTransitionApplicationStatus('WORKING', 'WORKED_30_DAYS')).toBe(true);
    expect(canTransitionApplicationStatus('REJECTED', 'HIRED')).toBe(false);
    expect(canTransitionApplicationStatus('WORKED_30_DAYS', 'WORKING')).toBe(false);
  });
});
