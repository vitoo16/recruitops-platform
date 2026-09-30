import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationIdSchema,
  CommissionTransactionListQuerySchema,
  CreateReconciliationBatchSchema,
  ReconciliationBatchIdSchema,
  ReconciliationBatchListQuerySchema,
  UpdateApplicationStatusSchema,
  canTransitionApplicationStatus,
  type Application,
  type CommissionEventType,
  type CommissionTransactionListResponse,
  type ReconciliationBatch,
  type ReconciliationBatchListResponse,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';
import { mapDatabaseApplication, milestoneForStatus } from '../candidates/candidates.repository.js';
import {
  allocateCommissionMinor,
  commissionAllocationKey,
  commissionEventForStatus,
  nextCommissionPayableAt,
  selectEarliestCommissionBeneficiaries,
  vietnamPaymentInstant,
} from './commission-rules.js';
import {
  CommissionsRepository,
  mapDatabaseReconciliationBatch,
} from './commissions.repository.js';

@Injectable()
export class CommissionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly commissions: CommissionsRepository,
  ) {}

  async listTransactions(
    query: unknown,
    principal: AuthenticatedPrincipal,
  ): Promise<CommissionTransactionListResponse> {
    const parsed = parseRequest(CommissionTransactionListQuerySchema, query);
    return this.commissions.listTransactions(
      principal.role === 'RECRUITER'
        ? { ...parsed, beneficiaryActorId: principal.id }
        : parsed,
    );
  }

  async listBatches(query: unknown): Promise<ReconciliationBatchListResponse> {
    return this.commissions.listBatches(parseRequest(ReconciliationBatchListQuerySchema, query));
  }

  async transitionApplicationStatus(id: unknown, input: unknown): Promise<Application> {
    const applicationId = parseRequest(ApplicationIdSchema, id);
    const update = parseRequest(UpdateApplicationStatusSchema, input);
    const occurredAt = update.occurredAt ? new Date(update.occurredAt) : new Date();

    return this.database.client.$transaction(async (transaction) => {
      const current = await transaction.application.findUnique({
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
      if (!canTransitionApplicationStatus(current.status, update.status)) {
        throw new BadRequestException({
          code: 'INVALID_APPLICATION_STATUS_TRANSITION',
          message: `Cannot transition application from ${current.status} to ${update.status}`,
        });
      }

      const eventType = commissionEventForStatus(update.status);
      if (eventType) {
        const allocationKey = commissionAllocationKey({
          candidateId: current.candidateId,
          jobId: current.jobId,
          eventType,
        });
        const existingAllocation = await transaction.commissionTransaction.count({
          where: { allocationKey },
        });

        if (existingAllocation === 0) {
          const grossAmountMinor = this.requireCommissionAmount(current.job, eventType);
          const sources = await transaction.application.findMany({
            where: {
              candidateId: current.candidateId,
              jobId: current.jobId,
            },
            select: {
              id: true,
              sourcedByActorId: true,
              sourcedAt: true,
            },
          });
          const beneficiaries = selectEarliestCommissionBeneficiaries(
            sources.map((source) => ({
              applicationId: source.id,
              actorId: source.sourcedByActorId,
              sourcedAt: source.sourcedAt,
            })),
          );
          if (beneficiaries.length === 0) {
            throw new ConflictException({
              code: 'COMMISSION_SOURCE_ACTOR_REQUIRED',
              message: 'Commission milestone requires an attributed sourcing actor',
            });
          }

          const allocations = allocateCommissionMinor(grossAmountMinor, beneficiaries);
          const payableAt = nextCommissionPayableAt(eventType, occurredAt);
          await transaction.commissionTransaction.createMany({
            data: allocations.map((allocation) => ({
              applicationId: allocation.applicationId,
              beneficiaryActorId: allocation.actorId,
              eventType,
              allocationKey,
              amountMinor: allocation.amountMinor,
              grossAmountMinor,
              splitCount: allocations.length,
              currency: current.job.currency,
              earnedAt: occurredAt,
              payableAt,
            })),
            skipDuplicates: true,
          });
        }
      }

      const updated = await transaction.application.update({
        where: { id: applicationId },
        data: {
          status: update.status,
          ...milestoneForStatus(update.status, occurredAt),
        },
      });
      return mapDatabaseApplication(updated);
    });
  }

  async createReconciliationBatch(
    input: unknown,
    actorId: string,
  ): Promise<ReconciliationBatch> {
    const parsed = parseRequest(CreateReconciliationBatchSchema, input);
    const payableOn = vietnamPaymentInstant(parsed.payableOn);

    return this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.reconciliationBatch.findUnique({
        where: { payableOn },
        include: { transactions: { select: { amountMinor: true, currency: true } } },
      });
      if (existing) {
        throw new ConflictException({
          code: 'RECONCILIATION_BATCH_EXISTS',
          message: 'A reconciliation batch already exists for this payment day',
        });
      }

      const due = await transaction.commissionTransaction.findMany({
        where: {
          status: 'EARNED',
          reconciliationBatchId: null,
          payableAt: { lte: payableOn },
        },
        select: { id: true },
      });
      if (due.length === 0) {
        throw new BadRequestException({
          code: 'NO_COMMISSIONS_DUE',
          message: 'No earned commission is due for this reconciliation date',
        });
      }

      const batch = await transaction.reconciliationBatch.create({
        data: {
          payableOn,
          createdByActorId: actorId,
        },
      });
      await transaction.commissionTransaction.updateMany({
        where: {
          id: { in: due.map((item) => item.id) },
          status: 'EARNED',
          reconciliationBatchId: null,
        },
        data: {
          status: 'PAYABLE',
          reconciliationBatchId: batch.id,
        },
      });

      const hydrated = await transaction.reconciliationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: { transactions: { select: { amountMinor: true, currency: true } } },
      });
      return mapDatabaseReconciliationBatch(hydrated);
    });
  }

  async markBatchPaid(id: unknown): Promise<ReconciliationBatch> {
    const batchId = parseRequest(ReconciliationBatchIdSchema, id);
    const paidAt = new Date();

    return this.database.client.$transaction(async (transaction) => {
      const current = await transaction.reconciliationBatch.findUnique({
        where: { id: batchId },
        include: { transactions: { select: { amountMinor: true, currency: true } } },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'RECONCILIATION_BATCH_NOT_FOUND',
          message: 'Reconciliation batch was not found',
        });
      }
      if (current.status === 'PAID') return mapDatabaseReconciliationBatch(current);

      await transaction.commissionTransaction.updateMany({
        where: {
          reconciliationBatchId: batchId,
          status: 'PAYABLE',
        },
        data: { status: 'PAID', paidAt },
      });
      await transaction.reconciliationBatch.update({
        where: { id: batchId },
        data: { status: 'PAID', paidAt },
      });
      const hydrated = await transaction.reconciliationBatch.findUniqueOrThrow({
        where: { id: batchId },
        include: { transactions: { select: { amountMinor: true, currency: true } } },
      });
      return mapDatabaseReconciliationBatch(hydrated);
    });
  }

  private requireCommissionAmount(
    job: {
      interviewCommissionMinor: bigint | null;
      worked30DaysCommissionMinor: bigint | null;
    },
    eventType: CommissionEventType,
  ): bigint {
    const amount =
      eventType === 'INTERVIEW_INVITED'
        ? job.interviewCommissionMinor
        : job.worked30DaysCommissionMinor;
    if (amount === null) {
      throw new ConflictException({
        code: 'COMMISSION_RULE_NOT_CONFIGURED',
        message: `Job commission amount is required before ${eventType}`,
      });
    }
    return amount;
  }
}
