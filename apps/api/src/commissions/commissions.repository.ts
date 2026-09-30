import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type {
  CommissionTransaction,
  CommissionTransactionListQuery,
  CommissionTransactionListResponse,
  ReconciliationBatch,
  ReconciliationBatchListQuery,
  ReconciliationBatchListResponse,
} from '@recruitops/contracts';
import type {
  CommissionTransaction as DatabaseCommissionTransaction,
  ReconciliationBatch as DatabaseReconciliationBatch,
} from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';

function safeMinorAmount(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new InternalServerErrorException({
      code: 'UNSAFE_MONEY_VALUE',
      message: 'Stored monetary value exceeds the API safe-integer range',
    });
  }
  return number;
}

export function mapDatabaseCommissionTransaction(
  transaction: DatabaseCommissionTransaction,
): CommissionTransaction {
  return {
    id: transaction.id,
    applicationId: transaction.applicationId,
    beneficiaryActorId: transaction.beneficiaryActorId,
    eventType: transaction.eventType,
    allocationKey: transaction.allocationKey,
    amountMinor: safeMinorAmount(transaction.amountMinor),
    grossAmountMinor: safeMinorAmount(transaction.grossAmountMinor),
    splitCount: transaction.splitCount,
    currency: transaction.currency,
    status: transaction.status,
    earnedAt: transaction.earnedAt.toISOString(),
    payableAt: transaction.payableAt.toISOString(),
    paidAt: transaction.paidAt?.toISOString() ?? null,
    reconciliationBatchId: transaction.reconciliationBatchId,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

type BatchWithTransactions = DatabaseReconciliationBatch & {
  transactions: Array<{ amountMinor: bigint; currency: string }>;
};

export function mapDatabaseReconciliationBatch(batch: BatchWithTransactions): ReconciliationBatch {
  const currencies = [...new Set(batch.transactions.map((transaction) => transaction.currency))];
  const singleCurrency = currencies.length === 1 ? currencies[0]! : null;
  const totalAmountMinor = singleCurrency
    ? safeMinorAmount(
        batch.transactions.reduce((sum, transaction) => sum + transaction.amountMinor, 0n),
      )
    : null;

  return {
    id: batch.id,
    payableOn: batch.payableOn.toISOString(),
    status: batch.status,
    createdByActorId: batch.createdByActorId,
    paidAt: batch.paidAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    transactionCount: batch.transactions.length,
    totalAmountMinor,
    currency: singleCurrency,
  };
}

@Injectable()
export class CommissionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listTransactions(
    query: CommissionTransactionListQuery,
  ): Promise<CommissionTransactionListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.beneficiaryActorId ? { beneficiaryActorId: query.beneficiaryActorId } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
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

  async listBatches(query: ReconciliationBatchListQuery): Promise<ReconciliationBatchListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.database.client.reconciliationBatch.findMany({
        where,
        include: {
          transactions: { select: { amountMinor: true, currency: true } },
        },
        orderBy: [{ payableOn: 'desc' }, { id: 'desc' }],
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
}
