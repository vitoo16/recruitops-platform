import { BadRequestException, Injectable } from '@nestjs/common';
import type { CommissionMilestone, CommissionTransaction } from '@recruitops/contracts';
import { CommissionsRepository } from './commissions.repository.js';

export interface CommissionSourceApplication {
  id: string;
  sourceUserId: string | null;
  sourcedAt: Date;
}

export interface CommissionAllocationShare {
  applicationId: string;
  beneficiaryUserId: string;
  amountMinor: number;
  shareNumerator: number;
  shareDenominator: number;
}

export interface CommissionAllocation {
  sourceDate: string;
  shares: readonly CommissionAllocationShare[];
}

export interface AccrueDuplicateAwareCommissionInput {
  candidateId: string;
  jobId: string;
  milestone: CommissionMilestone;
  earnedAt: Date;
  businessTimeZone: string;
}

function requireBusinessTimeZone(timeZone: string): string {
  const normalized = timeZone.trim();
  if (!normalized) {
    throw new BadRequestException({
      code: 'COMMISSION_BUSINESS_TIME_ZONE_REQUIRED',
      message: 'A business time zone is required for duplicate-CV allocation',
    });
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date(0));
  } catch {
    throw new BadRequestException({
      code: 'COMMISSION_BUSINESS_TIME_ZONE_INVALID',
      message: 'Commission business time zone must be a valid IANA time zone',
    });
  }

  return normalized;
}

function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  if (Number.isNaN(instant.getTime())) {
    throw new BadRequestException({
      code: 'COMMISSION_SOURCE_TIME_INVALID',
      message: 'Application source time is invalid',
    });
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function requireBaseAmountMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException({
      code: 'COMMISSION_AMOUNT_INVALID',
      message: 'Commission amount must be a non-negative safe integer in minor units',
    });
  }
  return value;
}

export function allocateDuplicateCommission(input: {
  sources: readonly CommissionSourceApplication[];
  baseAmountMinor: number;
  businessTimeZone: string;
}): CommissionAllocation {
  const timeZone = requireBusinessTimeZone(input.businessTimeZone);
  const baseAmountMinor = requireBaseAmountMinor(input.baseAmountMinor);
  if (input.sources.length === 0) {
    throw new BadRequestException({
      code: 'COMMISSION_SOURCE_APPLICATION_REQUIRED',
      message: 'At least one source application is required for commission allocation',
    });
  }

  const dated = input.sources.map((source) => ({
    ...source,
    sourceDate: calendarDateInTimeZone(source.sourcedAt, timeZone),
  }));
  const sourceDate = dated.reduce(
    (earliest, source) => (source.sourceDate < earliest ? source.sourceDate : earliest),
    dated[0]!.sourceDate,
  );
  const earliestDaySources = dated.filter((source) => source.sourceDate === sourceDate);

  if (earliestDaySources.some((source) => !source.sourceUserId)) {
    throw new BadRequestException({
      code: 'COMMISSION_SOURCE_USER_REQUIRED',
      message: 'Earliest-day source applications must have authenticated source-user attribution',
    });
  }

  const sorted = [...earliestDaySources].sort(
    (left, right) =>
      left.sourcedAt.getTime() - right.sourcedAt.getTime() || left.id.localeCompare(right.id),
  );
  const byUser = new Map<string, CommissionSourceApplication>();
  for (const source of sorted) {
    const sourceUserId = source.sourceUserId!;
    if (!byUser.has(sourceUserId)) byUser.set(sourceUserId, source);
  }

  const beneficiaries = [...byUser.entries()].map(([beneficiaryUserId, source]) => ({
    beneficiaryUserId,
    source,
  }));
  beneficiaries.sort(
    (left, right) =>
      left.source.sourcedAt.getTime() - right.source.sourcedAt.getTime() ||
      left.source.id.localeCompare(right.source.id) ||
      left.beneficiaryUserId.localeCompare(right.beneficiaryUserId),
  );

  const denominator = beneficiaries.length;
  const quotient = Math.floor(baseAmountMinor / denominator);
  const remainder = baseAmountMinor % denominator;

  return {
    sourceDate,
    shares: beneficiaries.map((beneficiary, index) => ({
      applicationId: beneficiary.source.id,
      beneficiaryUserId: beneficiary.beneficiaryUserId,
      amountMinor: quotient + (index < remainder ? 1 : 0),
      shareNumerator: 1,
      shareDenominator: denominator,
    })),
  };
}

@Injectable()
export class CommissionAllocationService {
  constructor(private readonly commissions: CommissionsRepository) {}

  async accrueDuplicateAware(
    input: AccrueDuplicateAwareCommissionInput,
  ): Promise<readonly CommissionTransaction[]> {
    const context = await this.commissions.getAllocationContext(
      input.candidateId,
      input.jobId,
      input.milestone,
    );
    const allocation = allocateDuplicateCommission({
      sources: context.sources,
      baseAmountMinor: context.baseAmountMinor,
      businessTimeZone: input.businessTimeZone,
    });

    return Promise.all(
      allocation.shares.map((share) =>
        this.commissions.accrue({
          candidateId: input.candidateId,
          jobId: input.jobId,
          applicationId: share.applicationId,
          beneficiaryUserId: share.beneficiaryUserId,
          milestone: input.milestone,
          currency: context.currency,
          baseAmountMinor: context.baseAmountMinor,
          amountMinor: share.amountMinor,
          shareNumerator: share.shareNumerator,
          shareDenominator: share.shareDenominator,
          earnedAt: input.earnedAt,
          idempotencyKey: [
            'commission',
            input.candidateId,
            input.jobId,
            input.milestone,
            share.beneficiaryUserId,
          ].join(':'),
        }),
      ),
    );
  }
}
