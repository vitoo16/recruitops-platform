import type { ApplicationStatus, CommissionEventType } from '@recruitops/contracts';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;

export interface CommissionSourceAttribution {
  applicationId: string;
  actorId: string | null;
  sourcedAt: Date;
}

export interface CommissionBeneficiary {
  applicationId: string;
  actorId: string;
  sourcedAt: Date;
}

export interface CommissionAllocation extends CommissionBeneficiary {
  amountMinor: bigint;
}

export function commissionEventForStatus(
  status: ApplicationStatus,
): CommissionEventType | undefined {
  if (status === 'INTERVIEW_INVITED') return 'INTERVIEW_INVITED';
  if (status === 'WORKED_30_DAYS') return 'WORKED_30_DAYS';
  return undefined;
}

export function vietnamDateKey(value: Date): string {
  return new Date(value.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function selectEarliestCommissionBeneficiaries(
  sources: readonly CommissionSourceAttribution[],
): CommissionBeneficiary[] {
  const attributed = sources
    .filter((source): source is CommissionSourceAttribution & { actorId: string } =>
      Boolean(source.actorId),
    )
    .sort(
      (left, right) =>
        left.sourcedAt.getTime() - right.sourcedAt.getTime() ||
        left.actorId.localeCompare(right.actorId) ||
        left.applicationId.localeCompare(right.applicationId),
    );

  const first = attributed[0];
  if (!first) return [];
  const earliestDay = vietnamDateKey(first.sourcedAt);

  const byActor = new Map<string, CommissionBeneficiary>();
  for (const source of attributed) {
    if (vietnamDateKey(source.sourcedAt) !== earliestDay) break;
    if (!byActor.has(source.actorId)) {
      byActor.set(source.actorId, {
        applicationId: source.applicationId,
        actorId: source.actorId,
        sourcedAt: source.sourcedAt,
      });
    }
  }
  return [...byActor.values()];
}

export function allocateCommissionMinor(
  grossAmountMinor: bigint,
  beneficiaries: readonly CommissionBeneficiary[],
): CommissionAllocation[] {
  if (grossAmountMinor < 0n) {
    throw new Error('COMMISSION_GROSS_AMOUNT_NEGATIVE');
  }
  if (beneficiaries.length === 0) return [];

  const count = BigInt(beneficiaries.length);
  const base = grossAmountMinor / count;
  const remainder = Number(grossAmountMinor % count);

  return beneficiaries.map((beneficiary, index) => ({
    ...beneficiary,
    amountMinor: base + (index < remainder ? 1n : 0n),
  }));
}

export function commissionAllocationKey(input: {
  candidateId: string;
  jobId: string;
  eventType: CommissionEventType;
}): string {
  return `${input.candidateId}:${input.jobId}:${input.eventType}`;
}

export function nextCommissionPayableAt(eventType: CommissionEventType, earnedAt: Date): Date {
  const paymentDay = eventType === 'INTERVIEW_INVITED' ? 5 : 15;
  const local = new Date(earnedAt.getTime() + VIETNAM_OFFSET_MS);
  let year = local.getUTCFullYear();
  let month = local.getUTCMonth();
  const day = local.getUTCDate();

  // A commission earned on the payment date belongs to the next cycle because
  // the stakeholder source defines the day, not an intra-day payout cutoff.
  // This also guarantees payableAt never predates earnedAt.
  if (day >= paymentDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return new Date(Date.UTC(year, month, paymentDay, -7, 0, 0, 0));
}

export function vietnamPaymentInstant(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('COMMISSION_PAYMENT_DATE_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month, day, -7, 0, 0, 0));
}
