import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CommissionsRepository } from './commissions.repository.js';
import {
  allocateDuplicateCommission,
  CommissionAllocationService,
  type CommissionSourceApplication,
} from './commission-allocation.js';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const userC = '33333333-3333-4333-8333-333333333333';

const sources: CommissionSourceApplication[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    sourceUserId: userA,
    sourcedAt: new Date('2026-09-30T15:00:00.000Z'),
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    sourceUserId: userB,
    sourcedAt: new Date('2026-09-30T16:00:00.000Z'),
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    sourceUserId: userA,
    sourcedAt: new Date('2026-09-30T16:30:00.000Z'),
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    sourceUserId: userC,
    sourcedAt: new Date('2026-09-30T17:30:00.000Z'),
  },
];

describe('allocateDuplicateCommission', () => {
  it('splits only distinct CTV on the earliest business-calendar day', () => {
    const allocation = allocateDuplicateCommission({
      sources,
      baseAmountMinor: 100_001,
      businessTimeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(allocation).toEqual({
      sourceDate: '2026-09-30',
      shares: [
        {
          applicationId: sources[0]!.id,
          beneficiaryUserId: userA,
          amountMinor: 50_001,
          shareNumerator: 1,
          shareDenominator: 2,
        },
        {
          applicationId: sources[1]!.id,
          beneficiaryUserId: userB,
          amountMinor: 50_000,
          shareNumerator: 1,
          shareDenominator: 2,
        },
      ],
    });
    expect(allocation.shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(100_001);
  });

  it('uses the configured business timezone rather than the server or UTC calendar day', () => {
    const allocation = allocateDuplicateCommission({
      sources: [sources[2]!, sources[3]!],
      baseAmountMinor: 70_000,
      businessTimeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(allocation.sourceDate).toBe('2026-09-30');
    expect(allocation.shares).toHaveLength(1);
    expect(allocation.shares[0]?.beneficiaryUserId).toBe(userA);
  });

  it('fails closed when an earliest-day application lacks source-user attribution', () => {
    expect(() =>
      allocateDuplicateCommission({
        sources: [{ ...sources[0]!, sourceUserId: null }, sources[1]!],
        baseAmountMinor: 100_000,
        businessTimeZone: 'Asia/Ho_Chi_Minh',
      }),
    ).toThrow(BadRequestException);

    try {
      allocateDuplicateCommission({
        sources: [{ ...sources[0]!, sourceUserId: null }, sources[1]!],
        baseAmountMinor: 100_000,
        businessTimeZone: 'Asia/Ho_Chi_Minh',
      });
      throw new Error('expected allocation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: 'COMMISSION_SOURCE_USER_REQUIRED' }),
      );
    }
  });

  it('rejects an invalid business timezone instead of silently using the host timezone', () => {
    expect(() =>
      allocateDuplicateCommission({
        sources: [sources[0]!],
        baseAmountMinor: 100_000,
        businessTimeZone: 'Not/A_Time_Zone',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('CommissionAllocationService', () => {
  it('accrues deterministic idempotent shares from repository context', async () => {
    const getAllocationContext = vi.fn().mockResolvedValue({
      currency: 'VND',
      baseAmountMinor: 100_001,
      sources,
    });
    const accrue = vi.fn(async (input) => input);
    const repository = { getAllocationContext, accrue } as unknown as CommissionsRepository;
    const service = new CommissionAllocationService(repository);
    const earnedAt = new Date('2026-10-10T08:00:00.000Z');

    await service.accrueDuplicateAware({
      candidateId: '44444444-4444-4444-8444-444444444444',
      jobId: '55555555-5555-4555-8555-555555555555',
      milestone: 'INTERVIEW_INVITED',
      earnedAt,
      businessTimeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(getAllocationContext).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      'INTERVIEW_INVITED',
    );
    expect(accrue).toHaveBeenCalledTimes(2);
    expect(accrue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        beneficiaryUserId: userA,
        amountMinor: 50_001,
        idempotencyKey:
          'commission:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555:INTERVIEW_INVITED:11111111-1111-4111-8111-111111111111',
      }),
    );
  });
});
