import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CommissionMilestone,
  CommissionTransaction,
  CommissionTransactionListQuery,
  CommissionTransactionListResponse,
} from '@recruitops/contracts';
import type { CommissionTransaction as DatabaseCommissionTransaction } from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';
import type { CommissionSourceApplication } from './commission-allocation.js';

function safeMinorAmount(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new InternalServerErrorException({
      code: 'UNSAFE_COMMISSION_MONEY_VALUE',
      message: 'Stored commission amount exceeds the API safe-integer range',
    });
  }
  return number;
}

export function mapDatabaseCommissionTransaction(
  transaction: DatabaseCommissionTransaction,
): CommissionTransaction {
  return {
    id: transaction.id,
    candidateId: transaction.candidateId,
    jobId: transaction.jobId,
    applicationId: transaction.applicationId,
    beneficiaryUserId: transaction.beneficiaryUserId,
    milestone: transaction.milestone,
    currency: transaction.currency,
    baseAmountMinor: safeMinorAmount(transaction.baseAmountMinor),
    amountMinor: safeMinorAmount(transaction.amountMinor),
    shareNumerator: transaction.shareNumerator,
    shareDenominator: transaction.shareDenominator,
    earnedAt: transaction.earnedAt.toISOString(),
    status: transaction.status,
    idempotencyKey: transaction.idempotencyKey,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export interface AccrueCommissionTransactionInput {
  candidateId: string;
  jobId: string;
  applicationId: string;
  beneficiaryUserId: string;
  milestone: CommissionMilestone;
  currency: string;
  baseAmountMinor: number;
  amountMinor: number;
  shareNumerator: number;
  shareDenominator: number;
  earnedAt: Date;
  idempotencyKey: string;
}

export interface CommissionAllocationContext {
  currency: string;
  baseAmountMinor: number;
  sources: readonly CommissionSourceApplication[];
}

@Injectable()
export class CommissionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async getAllocationContext(
    candidateId: string,
    jobId: string,
    milestone: CommissionMilestone,
  ): Promise<CommissionAllocationContext> {
    const [job, sources] = await Promise.all([
      this.database.client.job.findUnique({
        where: { id: jobId },
        select: {
          currency: true,
          interviewCommissionMinor: true,
          worked30DaysCommissionMinor: true,
        },
      }),
      this.database.client.application.findMany({
        where: { candidateId, jobId },
        select: { id: true, sourceUserId: true, sourcedAt: true },
        orderBy: [{ sourcedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    if (!job) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'Job was not found' });
    }
    const configuredAmount =
      milestone === 'INTERVIEW_INVITED'
        ? job.interviewCommissionMinor
        : job.worked30DaysCommissionMinor;
    if (configuredAmount === null) {
      throw new BadRequestException({
        code: 'COMMISSION_AMOUNT_NOT_CONFIGURED',
        message: 'The job has no commission amount configured for this milestone',
      });
    }

    return {
      currency: job.currency,
      baseAmountMinor: safeMinorAmount(configuredAmount),
      sources,
    };
  }

  async accrue(input: AccrueCommissionTransactionInput): Promise<CommissionTransaction> {
    const transaction = await this.database.client.commissionTransaction.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        candidateId: input.candidateId,
        jobId: input.jobId,
        applicationId: input.applicationId,
        beneficiaryUserId: input.beneficiaryUserId,
        milestone: input.milestone,
        currency: input.currency,
        baseAmountMinor: BigInt(input.baseAmountMinor),
        amountMinor: BigInt(input.amountMinor),
        shareNumerator: input.shareNumerator,
        shareDenominator: input.shareDenominator,
        earnedAt: input.earnedAt,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return mapDatabaseCommissionTransaction(transaction);
  }

  async list(query: CommissionTransactionListQuery): Promise<CommissionTransactionListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.beneficiaryUserId ? { beneficiaryUserId: query.beneficiaryUserId } : {}),
      ...(query.milestone ? { milestone: query.milestone } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.database.client.commissionTransaction.findMany({
        where,
        orderBy: [{ earnedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.commissionTransaction.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabaseCommissionTransaction),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<CommissionTransaction> {
    const transaction = await this.database.client.commissionTransaction.findUnique({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException({
        code: 'COMMISSION_TRANSACTION_NOT_FOUND',
        message: 'Commission transaction was not found',
      });
    }
    return mapDatabaseCommissionTransaction(transaction);
  }
}
