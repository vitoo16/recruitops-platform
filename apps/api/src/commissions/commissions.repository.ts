import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CommissionMilestone,
  CommissionTransaction,
  CommissionTransactionListQuery,
  CommissionTransactionListResponse,
  ReconciliationBatch,
  ReconciliationBatchDetail,
  ReconciliationBatchListQuery,
  ReconciliationBatchListResponse,
} from '@recruitops/contracts';
import type {
  CommissionTransaction as DatabaseCommissionTransaction,
  ReconciliationBatch as DatabaseReconciliationBatch,
} from '@recruitops/database';
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

function safeBatchTotalAmount(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new BadRequestException({
      code: 'RECONCILIATION_BATCH_TOTAL_UNSAFE',
      message: 'Batch total exceeds the API safe-integer range; split it into smaller batches',
    });
  }
  return number;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sameSortedIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

type DatabaseBatchWithTransactions = DatabaseReconciliationBatch & {
  transactions: Array<{ id: string }>;
};

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
    reconciliationBatchId: transaction.reconciliationBatchId,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export function mapDatabaseReconciliationBatch(
  batch: DatabaseReconciliationBatch,
): ReconciliationBatch {
  return {
    id: batch.id,
    payableOn: dateOnly(batch.payableOn),
    milestone: batch.milestone,
    currency: batch.currency,
    transactionCount: batch.transactionCount,
    totalAmountMinor: safeMinorAmount(batch.totalAmountMinor),
    status: batch.status,
    createdByUserId: batch.createdByUserId,
    paidByUserId: batch.paidByUserId,
    paidAt: batch.paidAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export function mapDatabaseReconciliationBatchDetail(
  batch: DatabaseBatchWithTransactions,
): ReconciliationBatchDetail {
  return {
    ...mapDatabaseReconciliationBatch(batch),
    transactionIds: batch.transactions.map((transaction) => transaction.id),
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

export interface CreateReconciliationBatchRepositoryInput {
  id: string;
  payableOn: string;
  milestone: CommissionMilestone;
  transactionIds: readonly string[];
  createdByUserId: string;
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
      ...(query.reconciliationBatchId
        ? { reconciliationBatchId: query.reconciliationBatchId }
        : {}),
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

  async createReconciliationBatch(
    input: CreateReconciliationBatchRepositoryInput,
  ): Promise<ReconciliationBatchDetail> {
    const requestedIds = [...input.transactionIds].sort();
    const payableOn = new Date(`${input.payableOn}T00:00:00.000Z`);

    return this.database.client.$transaction(async (database) => {
      const existing = await database.reconciliationBatch.findUnique({
        where: { id: input.id },
        include: {
          transactions: {
            select: { id: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (existing) {
        if (
          dateOnly(existing.payableOn) !== input.payableOn ||
          existing.milestone !== input.milestone ||
          !sameSortedIds(
            existing.transactions.map((transaction) => transaction.id),
            requestedIds,
          )
        ) {
          throw new ConflictException({
            code: 'RECONCILIATION_BATCH_ID_REUSED',
            message: 'The reconciliation batch ID is already bound to another immutable snapshot',
          });
        }
        return mapDatabaseReconciliationBatchDetail(existing);
      }

      const transactions = await database.commissionTransaction.findMany({
        where: { id: { in: requestedIds } },
        select: {
          id: true,
          milestone: true,
          currency: true,
          amountMinor: true,
          status: true,
          reconciliationBatchId: true,
        },
      });

      if (transactions.length !== requestedIds.length) {
        throw new BadRequestException({
          code: 'RECONCILIATION_TRANSACTION_NOT_FOUND',
          message: 'Every selected commission transaction must exist',
        });
      }
      if (
        transactions.some(
          (transaction) =>
            transaction.status !== 'ACCRUED' || transaction.reconciliationBatchId !== null,
        )
      ) {
        throw new ConflictException({
          code: 'RECONCILIATION_TRANSACTION_NOT_ACCRUED',
          message: 'Selected commission transactions must still be unbatched ACCRUED rows',
        });
      }
      if (transactions.some((transaction) => transaction.milestone !== input.milestone)) {
        throw new BadRequestException({
          code: 'RECONCILIATION_MILESTONE_MISMATCH',
          message: 'Selected transactions do not match the payout class for payableOn',
        });
      }

      const currencies = new Set(transactions.map((transaction) => transaction.currency));
      if (currencies.size !== 1) {
        throw new BadRequestException({
          code: 'RECONCILIATION_CURRENCY_MISMATCH',
          message: 'A reconciliation batch can contain only one currency',
        });
      }
      const currency = transactions[0]!.currency;
      const totalAmountMinorBigInt = transactions.reduce(
        (sum, transaction) => sum + transaction.amountMinor,
        0n,
      );
      safeBatchTotalAmount(totalAmountMinorBigInt);

      await database.reconciliationBatch.create({
        data: {
          id: input.id,
          payableOn,
          milestone: input.milestone,
          currency,
          transactionCount: requestedIds.length,
          totalAmountMinor: totalAmountMinorBigInt,
          createdByUserId: input.createdByUserId,
        },
      });

      const update = await database.commissionTransaction.updateMany({
        where: {
          id: { in: requestedIds },
          status: 'ACCRUED',
          reconciliationBatchId: null,
        },
        data: {
          status: 'BATCHED',
          reconciliationBatchId: input.id,
        },
      });
      if (update.count !== requestedIds.length) {
        throw new ConflictException({
          code: 'RECONCILIATION_TRANSACTION_RACE',
          message: 'One or more transactions changed while the batch was being created',
        });
      }

      const hydrated = await database.reconciliationBatch.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          transactions: {
            select: { id: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      return mapDatabaseReconciliationBatchDetail(hydrated);
    });
  }

  async listReconciliationBatches(
    query: ReconciliationBatchListQuery,
  ): Promise<ReconciliationBatchListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.milestone ? { milestone: query.milestone } : {}),
      ...(query.payableOn
        ? { payableOn: new Date(`${query.payableOn}T00:00:00.000Z`) }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.database.client.reconciliationBatch.findMany({
        where,
        orderBy: [{ payableOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.reconciliationBatch.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabaseReconciliationBatch),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getReconciliationBatchById(id: string): Promise<ReconciliationBatchDetail> {
    const batch = await this.database.client.reconciliationBatch.findUnique({
      where: { id },
      include: {
        transactions: {
          select: { id: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!batch) {
      throw new NotFoundException({
        code: 'RECONCILIATION_BATCH_NOT_FOUND',
        message: 'Reconciliation batch was not found',
      });
    }
    return mapDatabaseReconciliationBatchDetail(batch);
  }

  async markReconciliationBatchPaid(
    id: string,
    paidByUserId: string,
  ): Promise<ReconciliationBatchDetail> {
    return this.database.client.$transaction(async (database) => {
      const batch = await database.reconciliationBatch.findUnique({
        where: { id },
        include: {
          transactions: {
            select: { id: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (!batch) {
        throw new NotFoundException({
          code: 'RECONCILIATION_BATCH_NOT_FOUND',
          message: 'Reconciliation batch was not found',
        });
      }
      if (batch.status === 'PAID') {
        return mapDatabaseReconciliationBatchDetail(batch);
      }

      const batchedCount = await database.commissionTransaction.count({
        where: {
          reconciliationBatchId: id,
          status: 'BATCHED',
        },
      });
      if (batchedCount !== batch.transactionCount || batch.transactions.length !== batchedCount) {
        throw new ConflictException({
          code: 'RECONCILIATION_BATCH_LEDGER_MISMATCH',
          message: 'Batch ledger rows no longer match the immutable snapshot',
        });
      }

      const updatedTransactions = await database.commissionTransaction.updateMany({
        where: {
          reconciliationBatchId: id,
          status: 'BATCHED',
        },
        data: { status: 'PAID' },
      });
      if (updatedTransactions.count !== batch.transactionCount) {
        throw new ConflictException({
          code: 'RECONCILIATION_BATCH_PAYMENT_RACE',
          message: 'One or more transactions changed while the batch was being paid',
        });
      }

      const paidAt = new Date();
      await database.reconciliationBatch.update({
        where: { id },
        data: {
          status: 'PAID',
          paidByUserId,
          paidAt,
        },
      });

      const hydrated = await database.reconciliationBatch.findUniqueOrThrow({
        where: { id },
        include: {
          transactions: {
            select: { id: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      return mapDatabaseReconciliationBatchDetail(hydrated);
    });
  }
}
