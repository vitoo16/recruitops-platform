import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CommissionTransactionIdSchema,
  CommissionTransactionListQuerySchema,
  CreateReconciliationBatchSchema,
  ReconciliationBatchIdSchema,
  ReconciliationBatchListQuerySchema,
  type CommissionMilestone,
  type CommissionTransaction,
  type CommissionTransactionListResponse,
  type ReconciliationBatchDetail,
  type ReconciliationBatchListResponse,
} from '@recruitops/contracts';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import { CommissionsRepository } from './commissions.repository.js';
import { buildReconciliationBatchCsv } from './reconciliation-export.js';

const ActorIdSchema = z.uuid();

export function reconciliationMilestoneForPayableOn(payableOn: string): CommissionMilestone {
  const day = Number(payableOn.slice(8, 10));
  if (day === 5) return 'INTERVIEW_INVITED';
  if (day === 15) return 'WORKED_30_DAYS';
  throw new BadRequestException({
    code: 'RECONCILIATION_PAYOUT_DAY_INVALID',
    message: 'Commission payouts are supported only on stakeholder payment days 5 and 15',
  });
}

@Injectable()
export class CommissionsService {
  constructor(private readonly commissions: CommissionsRepository) {}

  list(query: unknown): Promise<CommissionTransactionListResponse> {
    return this.commissions.list(parseRequest(CommissionTransactionListQuerySchema, query));
  }

  getById(id: unknown): Promise<CommissionTransaction> {
    return this.commissions.getById(parseRequest(CommissionTransactionIdSchema, id));
  }

  listReconciliationBatches(query: unknown): Promise<ReconciliationBatchListResponse> {
    return this.commissions.listReconciliationBatches(
      parseRequest(ReconciliationBatchListQuerySchema, query),
    );
  }

  getReconciliationBatchById(id: unknown): Promise<ReconciliationBatchDetail> {
    return this.commissions.getReconciliationBatchById(
      parseRequest(ReconciliationBatchIdSchema, id),
    );
  }

  async exportReconciliationBatchCsv(
    id: unknown,
  ): Promise<{ filename: string; csv: string }> {
    const batchId = parseRequest(ReconciliationBatchIdSchema, id);
    const batch = await this.commissions.getReconciliationBatchById(batchId);
    const transactions: CommissionTransaction[] = [];

    for (let page = 1; transactions.length < batch.transactionCount; page += 1) {
      const response = await this.commissions.list({
        reconciliationBatchId: batchId,
        page,
        pageSize: 100,
      });
      transactions.push(...response.items);
      if (response.items.length === 0 || transactions.length >= response.total) break;
    }

    const ids = transactions.map((transaction) => transaction.id).sort();
    const expectedIds = [...batch.transactionIds].sort();
    const totalAmountMinor = transactions.reduce(
      (total, transaction) => total + BigInt(transaction.amountMinor),
      0n,
    );
    const matchesSnapshot =
      transactions.length === batch.transactionCount &&
      ids.length === expectedIds.length &&
      ids.every((value, index) => value === expectedIds[index]) &&
      transactions.every(
        (transaction) =>
          transaction.reconciliationBatchId === batch.id &&
          transaction.milestone === batch.milestone &&
          transaction.currency === batch.currency,
      ) &&
      totalAmountMinor === BigInt(batch.totalAmountMinor);

    if (!matchesSnapshot) {
      throw new ConflictException({
        code: 'RECONCILIATION_EXPORT_LEDGER_MISMATCH',
        message: 'Batch ledger rows no longer match the immutable reconciliation snapshot',
      });
    }

    return {
      filename: `commission-reconciliation-${batch.payableOn}-${batch.id}.csv`,
      csv: buildReconciliationBatchCsv(batch, transactions),
    };
  }

  createReconciliationBatch(actorId: unknown, input: unknown): Promise<ReconciliationBatchDetail> {
    const actor = parseRequest(ActorIdSchema, actorId);
    const parsed = parseRequest(CreateReconciliationBatchSchema, input);
    return this.commissions.createReconciliationBatch({
      ...parsed,
      milestone: reconciliationMilestoneForPayableOn(parsed.payableOn),
      createdByUserId: actor,
    });
  }

  markReconciliationBatchPaid(actorId: unknown, id: unknown): Promise<ReconciliationBatchDetail> {
    return this.commissions.markReconciliationBatchPaid(
      parseRequest(ReconciliationBatchIdSchema, id),
      parseRequest(ActorIdSchema, actorId),
    );
  }
}
