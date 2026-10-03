import { BadRequestException, Injectable } from '@nestjs/common';
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
