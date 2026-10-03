import type { CommissionTransaction, ReconciliationBatchDetail } from '@recruitops/contracts';

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildReconciliationBatchCsv(
  batch: ReconciliationBatchDetail,
  transactions: readonly CommissionTransaction[],
): string {
  const header = [
    'reconciliation_batch_id',
    'payable_on',
    'batch_status',
    'milestone',
    'currency',
    'transaction_id',
    'candidate_id',
    'job_id',
    'application_id',
    'beneficiary_user_id',
    'amount_minor',
    'share_numerator',
    'share_denominator',
    'earned_at',
    'transaction_status',
  ];

  const rows = transactions.map((transaction) => [
    batch.id,
    batch.payableOn,
    batch.status,
    transaction.milestone,
    transaction.currency,
    transaction.id,
    transaction.candidateId,
    transaction.jobId,
    transaction.applicationId,
    transaction.beneficiaryUserId,
    transaction.amountMinor,
    transaction.shareNumerator,
    transaction.shareDenominator,
    transaction.earnedAt,
    transaction.status,
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(','))
    .join('\r\n')}\r\n`;
}
