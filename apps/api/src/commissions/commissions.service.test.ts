import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CommissionsService, reconciliationMilestoneForPayableOn } from './commissions.service.js';
import type { DatabaseService } from '../database/database.service.js';
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

function databaseMock(): DatabaseService {
  return { client: {} } as unknown as DatabaseService;
}

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

describe('CommissionsService milestone accrual', () => {
  it('accrues duplicate-aware shares in the same database transaction as the status update', async () => {
    const sourceA = {
      id: '88888888-8888-4888-8888-888888888888',
      sourceUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourcedAt: new Date('2026-10-02T16:30:00.000Z'),
    };
    const sourceB = {
      id: '99999999-9999-4999-8999-999999999999',
      sourceUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sourcedAt: new Date('2026-10-02T17:30:00.000Z'),
    };
    const storedApplication = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      candidateId: transaction.candidateId,
      jobId: transaction.jobId,
      status: 'SUBMITTED' as const,
      sourcePlatform: null,
      sourceDestinationId: null,
      sourceUserId: sourceA.sourceUserId,
      sourceLabel: null,
      sourcedAt: sourceA.sourcedAt,
      submittedAt: new Date('2026-10-02T16:35:00.000Z'),
      interviewInvitedAt: null,
      interviewAt: null,
      hiredAt: null,
      startedAt: null,
      worked30DaysAt: null,
      createdAt: sourceA.sourcedAt,
      updatedAt: sourceA.sourcedAt,
      job: {
        currency: 'VND',
        interviewCommissionMinor: 100_001n,
        worked30DaysCommissionMinor: 200_000n,
      },
    };
    const updatedApplication = {
      ...storedApplication,
      status: 'INTERVIEW_INVITED' as const,
      interviewInvitedAt: new Date('2026-10-03T08:00:00.000Z'),
    };
    const upsert = vi.fn(async (_args: { create: { amountMinor: bigint } }) => ({}));
    const update = vi.fn(async () => updatedApplication);
    const tx = {
      application: {
        findUnique: vi.fn(async () => storedApplication),
        findMany: vi.fn(async () => [sourceA, sourceB]),
        update,
      },
      commissionTransaction: { upsert },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (transactionClient: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as unknown as DatabaseService;
    const service = new CommissionsService(repositoryMock(), database);
    const occurredAt = new Date('2026-10-03T08:00:00.000Z');

    const result = await service.transitionApplicationStatus(
      storedApplication.id,
      'INTERVIEW_INVITED',
      occurredAt,
      'Asia/Ho_Chi_Minh',
    );

    expect(result.status).toBe('INTERVIEW_INVITED');
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map(([call]) => call.create.amountMinor)).toEqual([50_001n, 50_000n]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INTERVIEW_INVITED',
          interviewInvitedAt: occurredAt,
        }),
      }),
    );
  });

  it('fails before changing application status when business timezone is missing', async () => {
    const source = {
      id: '88888888-8888-4888-8888-888888888888',
      sourceUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourcedAt: new Date('2026-10-02T16:30:00.000Z'),
    };
    const storedApplication = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      candidateId: transaction.candidateId,
      jobId: transaction.jobId,
      status: 'SUBMITTED' as const,
      sourcePlatform: null,
      sourceDestinationId: null,
      sourceUserId: source.sourceUserId,
      sourceLabel: null,
      sourcedAt: source.sourcedAt,
      submittedAt: new Date('2026-10-02T16:35:00.000Z'),
      interviewInvitedAt: null,
      interviewAt: null,
      hiredAt: null,
      startedAt: null,
      worked30DaysAt: null,
      createdAt: source.sourcedAt,
      updatedAt: source.sourcedAt,
      job: {
        currency: 'VND',
        interviewCommissionMinor: 100_000n,
        worked30DaysCommissionMinor: 200_000n,
      },
    };
    const update = vi.fn();
    const tx = {
      application: {
        findUnique: vi.fn(async () => storedApplication),
        findMany: vi.fn(async () => [source]),
        update,
      },
      commissionTransaction: { upsert: vi.fn() },
    };
    const database = {
      client: {
        $transaction: vi.fn(async (callback: (transactionClient: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
    } as unknown as DatabaseService;
    const service = new CommissionsService(repositoryMock(), database);

    await expect(
      service.transitionApplicationStatus(
        storedApplication.id,
        'INTERVIEW_INVITED',
        new Date('2026-10-03T08:00:00.000Z'),
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('CommissionsService reconciliation batches', () => {
  it('derives the payout class server-side and preserves authenticated actor attribution', async () => {
    const repository = repositoryMock();
    const service = new CommissionsService(repository, databaseMock());
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
    const service = new CommissionsService(repository, databaseMock());

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
    const service = new CommissionsService(repository, databaseMock());

    await expect(
      service.exportReconciliationBatchCsv('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
