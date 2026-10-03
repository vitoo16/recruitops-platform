import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommissionTransactionIdSchema,
  CommissionTransactionListQuerySchema,
  CreateReconciliationBatchSchema,
  ReconciliationBatchIdSchema,
  ReconciliationBatchListQuerySchema,
  canTransitionApplicationStatus,
  type Application,
  type ApplicationStatus,
  type CommissionMilestone,
  type CommissionTransaction,
  type CommissionTransactionListResponse,
  type ReconciliationBatchDetail,
  type ReconciliationBatchListResponse,
} from '@recruitops/contracts';
import { z } from 'zod';
import { mapDatabaseApplication, milestoneForStatus } from '../candidates/candidates.repository.js';
import { parseRequest } from '../common/zod-request.js';
import { DatabaseService } from '../database/database.service.js';
import { allocateDuplicateCommission } from './commission-allocation.js';
import { CommissionsRepository } from './commissions.repository.js';
import { buildReconciliationBatchCsv } from './reconciliation-export.js';

const ActorIdSchema = z.uuid();

function commissionMilestoneForStatus(status: ApplicationStatus): CommissionMilestone | null {
  if (status === 'INTERVIEW_INVITED') return 'INTERVIEW_INVITED';
  if (status === 'WORKED_30_DAYS') return 'WORKED_30_DAYS';
  return null;
}

function safeConfiguredCommissionAmount(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ConflictException({
      code: 'COMMISSION_AMOUNT_UNSAFE',
      message: 'Configured commission amount must be a non-negative safe integer in minor units',
    });
  }
  return amount;
}

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
  constructor(
    private readonly commissions: CommissionsRepository,
    private readonly database: DatabaseService,
  ) {}

  list(query: unknown): Promise<CommissionTransactionListResponse> {
    return this.commissions.list(parseRequest(CommissionTransactionListQuerySchema, query));
  }

  getById(id: unknown): Promise<CommissionTransaction> {
    return this.commissions.getById(parseRequest(CommissionTransactionIdSchema, id));
  }

  async transitionApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
    occurredAt: Date,
    businessTimeZone: string,
  ): Promise<Application> {
    return this.database.client.$transaction(async (database) => {
      const current = await database.application.findUnique({
        where: { id: applicationId },
        include: {
          job: {
            select: {
              currency: true,
              interviewCommissionMinor: true,
              worked30DaysCommissionMinor: true,
            },
          },
        },
      });

      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application was not found',
        });
      }
      if (!canTransitionApplicationStatus(current.status, status)) {
        throw new BadRequestException({
          code: 'INVALID_APPLICATION_STATUS_TRANSITION',
          message: `Cannot transition application from ${current.status} to ${status}`,
        });
      }
      if (current.status === status) return mapDatabaseApplication(current);

      const commissionMilestone = commissionMilestoneForStatus(status);
      if (commissionMilestone) {
        const configuredAmount =
          commissionMilestone === 'INTERVIEW_INVITED'
            ? current.job.interviewCommissionMinor
            : current.job.worked30DaysCommissionMinor;
        if (configuredAmount === null) {
          throw new ConflictException({
            code: 'COMMISSION_AMOUNT_NOT_CONFIGURED',
            message: 'The job must have a commission amount configured before this milestone',
          });
        }

        const sources = await database.application.findMany({
          where: {
            candidateId: current.candidateId,
            jobId: current.jobId,
          },
          select: { id: true, sourceUserId: true, sourcedAt: true },
          orderBy: [{ sourcedAt: 'asc' }, { id: 'asc' }],
        });
        const baseAmountMinor = safeConfiguredCommissionAmount(configuredAmount);
        const allocation = allocateDuplicateCommission({
          sources,
          baseAmountMinor,
          businessTimeZone,
        });

        for (const share of allocation.shares) {
          await database.commissionTransaction.upsert({
            where: {
              idempotencyKey: [
                'commission',
                current.candidateId,
                current.jobId,
                commissionMilestone,
                share.beneficiaryUserId,
              ].join(':'),
            },
            update: {},
            create: {
              candidateId: current.candidateId,
              jobId: current.jobId,
              applicationId: share.applicationId,
              beneficiaryUserId: share.beneficiaryUserId,
              milestone: commissionMilestone,
              currency: current.job.currency,
              baseAmountMinor: BigInt(baseAmountMinor),
              amountMinor: BigInt(share.amountMinor),
              shareNumerator: share.shareNumerator,
              shareDenominator: share.shareDenominator,
              earnedAt: occurredAt,
              idempotencyKey: [
                'commission',
                current.candidateId,
                current.jobId,
                commissionMilestone,
                share.beneficiaryUserId,
              ].join(':'),
            },
          });
        }
      }

      const updated = await database.application.update({
        where: { id: applicationId },
        data: {
          status,
          ...milestoneForStatus(status, occurredAt),
        },
      });
      return mapDatabaseApplication(updated);
    });
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

  async exportReconciliationBatchCsv(id: unknown): Promise<{ filename: string; csv: string }> {
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
