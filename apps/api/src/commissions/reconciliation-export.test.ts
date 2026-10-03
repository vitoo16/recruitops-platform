import { describe, expect, it } from 'vitest';
import type { CommissionTransaction, ReconciliationBatchDetail } from '@recruitops/contracts';
import { buildReconciliationBatchCsv } from './reconciliation-export.js';

const batch: ReconciliationBatchDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  payableOn: '2026-10-05',
  milestone: 'INTERVIEW_INVITED',
  currency: 'VND',
  transactionCount: 1,
  totalAmountMinor: 100_000,
  status: 'OPEN',
  createdByUserId: '22222222-2222-4222-8222-222222222222',
  paidByUserId: null,
  paidAt: null,
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
  transactionIds: ['33333333-3333-4333-8333-333333333333'],
};

const transaction: CommissionTransaction = {
  id: '33333333-3333-4333-8333-333333333333',
  candidateId: '44444444-4444-4444-8444-444444444444',
  jobId: '55555555-5555-4555-8555-555555555555',
  applicationId: '66666666-6666-4666-8666-666666666666',
  beneficiaryUserId: '77777777-7777-4777-8777-777777777777',
  milestone: 'INTERVIEW_INVITED',
  currency: 'VND',
  baseAmountMinor: 100_000,
  amountMinor: 100_000,
  shareNumerator: 1,
  shareDenominator: 1,
  earnedAt: '2026-10-03T08:00:00.000Z',
  status: 'BATCHED',
  idempotencyKey: 'commission:test',
  reconciliationBatchId: batch.id,
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
};

describe('buildReconciliationBatchCsv', () => {
  it('exports a deterministic UTF-8 CSV snapshot with integer minor units', () => {
    const csv = buildReconciliationBatchCsv(batch, [transaction]);

    expect(csv.startsWith('\uFEFFreconciliation_batch_id,')).toBe(true);
    expect(csv).toContain('100000,1,1,2026-10-03T08:00:00.000Z,BATCHED');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
