import { describe, expect, it } from 'vitest';
import {
  CommissionTransactionSchema,
  CreateReconciliationBatchSchema,
} from './commissions.js';

const baseTransaction = {
  id: '11111111-1111-4111-8111-111111111111',
  candidateId: '22222222-2222-4222-8222-222222222222',
  jobId: '33333333-3333-4333-8333-333333333333',
  applicationId: '44444444-4444-4444-8444-444444444444',
  beneficiaryUserId: '55555555-5555-4555-8555-555555555555',
  milestone: 'INTERVIEW_INVITED' as const,
  currency: 'VND',
  baseAmountMinor: 100_000,
  amountMinor: 50_000,
  shareNumerator: 1,
  shareDenominator: 2,
  earnedAt: '2026-10-01T00:00:00.000Z',
  status: 'ACCRUED' as const,
  idempotencyKey: 'candidate:job:interview:user',
  reconciliationBatchId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('CommissionTransactionSchema', () => {
  it('accepts integer minor-unit amounts', () => {
    expect(CommissionTransactionSchema.safeParse(baseTransaction).success).toBe(true);
  });

  it.each([
    ['fractional', 1.5],
    ['negative', -1],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects %s money values', (_label, amountMinor) => {
    expect(CommissionTransactionSchema.safeParse({ ...baseTransaction, amountMinor }).success).toBe(
      false,
    );
  });
});

describe('CreateReconciliationBatchSchema', () => {
  const transactionId = '66666666-6666-4666-8666-666666666666';

  it.each(['2026-10-05', '2026-10-15'])('accepts stakeholder payout date %s', (payableOn) => {
    expect(
      CreateReconciliationBatchSchema.safeParse({
        id: '77777777-7777-4777-8777-777777777777',
        payableOn,
        transactionIds: [transactionId],
      }).success,
    ).toBe(true);
  });

  it('rejects non-payout calendar days', () => {
    expect(
      CreateReconciliationBatchSchema.safeParse({
        id: '77777777-7777-4777-8777-777777777777',
        payableOn: '2026-10-06',
        transactionIds: [transactionId],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate transaction IDs', () => {
    expect(
      CreateReconciliationBatchSchema.safeParse({
        id: '77777777-7777-4777-8777-777777777777',
        payableOn: '2026-10-15',
        transactionIds: [transactionId, transactionId],
      }).success,
    ).toBe(false);
  });
});
