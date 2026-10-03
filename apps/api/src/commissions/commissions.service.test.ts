import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  CommissionsService,
  reconciliationMilestoneForPayableOn,
} from './commissions.service.js';
import type { CommissionsRepository } from './commissions.repository.js';

function repositoryMock(): CommissionsRepository {
  return {
    createReconciliationBatch: vi.fn(async (input) => ({
      id: input.id,
      payableOn: input.payableOn,
      milestone: input.milestone,
      currency: 'VND',
      transactionCount: input.transactionIds.length,
      totalAmountMinor: 100_000,
      status: 'OPEN',
      createdByUserId: input.createdByUserId,
      paidByUserId: null,
      paidAt: null,
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      transactionIds: [...input.transactionIds],
    })),
    markReconciliationBatchPaid: vi.fn(),
  } as unknown as CommissionsRepository;
}

describe('reconciliationMilestoneForPayableOn', () => {
  it('maps day 5 to interview commission', () => {
    expect(reconciliationMilestoneForPayableOn('2026-10-05')).toBe('INTERVIEW_INVITED');
  });

  it('maps day 15 to worked-30-days commission', () => {
    expect(reconciliationMilestoneForPayableOn('2026-10-15')).toBe('WORKED_30_DAYS');
  });

  it('fails closed for another calendar day', () => {
    expect(() => reconciliationMilestoneForPayableOn('2026-10-06')).toThrow(BadRequestException);
  });
});

describe('CommissionsService reconciliation batches', () => {
  it('derives the payout class server-side and preserves authenticated actor attribution', async () => {
    const repository = repositoryMock();
    const service = new CommissionsService(repository);
    const input = {
      id: '11111111-1111-4111-8111-111111111111',
      payableOn: '2026-10-05',
      transactionIds: ['22222222-2222-4222-8222-222222222222'],
    };

    await service.createReconciliationBatch(
      '33333333-3333-4333-8333-333333333333',
      input,
    );

    expect(repository.createReconciliationBatch).toHaveBeenCalledWith({
      ...input,
      milestone: 'INTERVIEW_INVITED',
      createdByUserId: '33333333-3333-4333-8333-333333333333',
    });
  });
});
