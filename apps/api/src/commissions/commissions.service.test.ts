import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CommissionsService, reconciliationMilestoneForPayableOn } from './commissions.service.js';
import type { CommissionsRepository } from './commissions.repository.js';

const transaction = {
  id: '22222222-2222-4222-8222-222222222222',
  candidateId: '44444444-4444-4444-8444-444444444444',
  jobId: '55555555-5555-4555-8555-555555555555',
  applicationId: '66666666-6666-4666-8666-666666666666',
  beneficiaryUserId: '77777777-7777-4777-8777-777777777777',
  milestone: 'INTERVIEW_INVITED' as const,
  currency: 'VND',
  baseAmountMinor: 100_000,
  amountMinor: 100_000,
  shareNumerator: 1,
  shareDenominator: 1,
  earnedAt: '2026-10-03T08:00:00.000Z',
  status: 'BATCHED' as const,
  idempotencyKey: 'commission:test',
  reconciliationBatchId: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
};

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
    getReconciliationBatchById: vi.fn(async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      payableOn: '2026-10-05',
      milestone: 'INTERVIEW_INVITED',
      currency: 'VND',
      transactionCount: 1,
      totalAmountMinor: 100_000,
      status: 'OPEN',
      createdByUserId: '33333333-3333-4333-8333-333333333333',
      paidByUserId: null,
      paidAt: null,
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      transactionIds: [transaction.id],
    })),
    list: vi.fn(async () => ({
      items: [transaction],
      page: 1,
      pageSize: 100,
      total: 1,
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

    await service.createReconciliationBatch('33333333-3333-4333-8333-333333333333', input);

    expect(repository.createReconciliationBatch).toHaveBeenCalledWith({
      ...input,
      milestone: 'INTERVIEW_INVITED',
      createdByUserId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('exports the immutable full batch snapshot instead of a dashboard page', async () => {
    const repository = repositoryMock();
    const service = new CommissionsService(repository);

    const exported = await service.exportReconciliationBatchCsv(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(exported.filename).toBe(
      'commission-reconciliation-2026-10-05-11111111-1111-4111-8111-111111111111.csv',
    );
    expect(exported.csv).toContain(transaction.id);
    expect(repository.list).toHaveBeenCalledWith({
      reconciliationBatchId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 100,
    });
  });

  it('fails closed if exported ledger rows do not match the batch snapshot', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.list).mockResolvedValue({
      items: [{ ...transaction, amountMinor: 99_999 }],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    const service = new CommissionsService(repository);

    await expect(
      service.exportReconciliationBatchCsv('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
