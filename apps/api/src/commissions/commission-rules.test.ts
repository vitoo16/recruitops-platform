import { describe, expect, it } from 'vitest';
import {
  allocateCommissionMinor,
  commissionAllocationKey,
  commissionEventForStatus,
  nextCommissionPayableAt,
  selectEarliestCommissionBeneficiaries,
  vietnamDateKey,
  vietnamPaymentInstant,
} from './commission-rules.js';

describe('commission rules', () => {
  it('maps only stakeholder commission milestones', () => {
    expect(commissionEventForStatus('INTERVIEW_INVITED')).toBe('INTERVIEW_INVITED');
    expect(commissionEventForStatus('WORKED_30_DAYS')).toBe('WORKED_30_DAYS');
    expect(commissionEventForStatus('HIRED')).toBeUndefined();
  });

  it('uses Vietnam local date for duplicate CV ownership', () => {
    const beforeMidnightUtc = new Date('2026-10-01T16:30:00.000Z');
    const afterMidnightVietnam = new Date('2026-10-01T17:30:00.000Z');
    expect(vietnamDateKey(beforeMidnightUtc)).toBe('2026-10-01');
    expect(vietnamDateKey(afterMidnightVietnam)).toBe('2026-10-02');
  });

  it('shares commission only across unique actors from the earliest sourcing day', () => {
    const sources = [
      {
        applicationId: '33333333-3333-4333-8333-333333333333',
        actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourcedAt: new Date('2026-10-01T03:00:00.000Z'),
      },
      {
        applicationId: '11111111-1111-4111-8111-111111111111',
        actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sourcedAt: new Date('2026-10-01T01:00:00.000Z'),
      },
      {
        applicationId: '22222222-2222-4222-8222-222222222222',
        actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sourcedAt: new Date('2026-10-01T02:00:00.000Z'),
      },
      {
        applicationId: '44444444-4444-4444-8444-444444444444',
        actorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourcedAt: new Date('2026-10-01T18:00:00.000Z'),
      },
    ];

    const beneficiaries = selectEarliestCommissionBeneficiaries(sources);
    expect(beneficiaries).toHaveLength(2);
    expect(beneficiaries.map((item) => item.actorId)).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);

    const allocations = allocateCommissionMinor(50_000n, beneficiaries);
    expect(allocations.map((item) => item.amountMinor)).toEqual([25_000n, 25_000n]);
  });

  it('preserves the exact gross amount when integer minor units do not divide evenly', () => {
    const beneficiaries = selectEarliestCommissionBeneficiaries([
      {
        applicationId: '11111111-1111-4111-8111-111111111111',
        actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourcedAt: new Date('2026-10-01T01:00:00.000Z'),
      },
      {
        applicationId: '22222222-2222-4222-8222-222222222222',
        actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sourcedAt: new Date('2026-10-01T02:00:00.000Z'),
      },
      {
        applicationId: '33333333-3333-4333-8333-333333333333',
        actorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourcedAt: new Date('2026-10-01T03:00:00.000Z'),
      },
    ]);
    const allocations = allocateCommissionMinor(50_000n, beneficiaries);
    expect(allocations.map((item) => item.amountMinor)).toEqual([16_667n, 16_667n, 16_666n]);
    expect(allocations.reduce((sum, item) => sum + item.amountMinor, 0n)).toBe(50_000n);
  });

  it('calculates the stakeholder day-5/day-15 payment cycle in Vietnam time', () => {
    expect(nextCommissionPayableAt('INTERVIEW_INVITED', new Date('2026-10-03T00:00:00Z'))).toISOString()).toBe(
      '2026-10-04T17:00:00.000Z',
    );
    expect(nextCommissionPayableAt('INTERVIEW_INVITED', new Date('2026-10-06T00:00:00Z'))).toISOString()).toBe(
      '2026-11-04T17:00:00.000Z',
    );
    expect(nextCommissionPayableAt('WORKED_30_DAYS', new Date('2026-10-15T09:00:00Z'))).toISOString()).toBe(
      '2026-10-14T17:00:00.000Z',
    );
    expect(nextCommissionPayableAt('WORKED_30_DAYS', new Date('2026-10-15T18:00:00Z'))).toISOString()).toBe(
      '2026-11-14T17:00:00.000Z',
    );
    expect(vietnamPaymentInstant('2026-10-15').toISOString()).toBe('2026-10-14T17:00:00.000Z');
  });

  it('builds one stable allocation key per candidate/job/event', () => {
    expect(
      commissionAllocationKey({
        candidateId: 'candidate',
        jobId: 'job',
        eventType: 'INTERVIEW_INVITED',
      }),
    ).toBe('candidate:job:INTERVIEW_INVITED');
  });
});
