import { z } from 'zod';

export const commissionMilestoneValues = ['INTERVIEW_INVITED', 'WORKED_30_DAYS'] as const;
export const commissionTransactionStatusValues = ['ACCRUED', 'BATCHED', 'PAID', 'VOIDED'] as const;
export const reconciliationBatchStatusValues = ['OPEN', 'PAID'] as const;

export const CommissionMilestoneSchema = z.enum(commissionMilestoneValues);
export const CommissionTransactionStatusSchema = z.enum(commissionTransactionStatusValues);
export const ReconciliationBatchStatusSchema = z.enum(reconciliationBatchStatusValues);
export const CommissionTransactionIdSchema = z.uuid();
export const ReconciliationBatchIdSchema = z.uuid();

const safeMoneyMinor = z.number().int().nonnegative().safe();

export const CommissionTransactionSchema = z.object({
  id: CommissionTransactionIdSchema,
  candidateId: z.uuid(),
  jobId: z.uuid(),
  applicationId: z.uuid(),
  beneficiaryUserId: z.uuid(),
  milestone: CommissionMilestoneSchema,
  currency: z.string().length(3),
  baseAmountMinor: safeMoneyMinor,
  amountMinor: safeMoneyMinor,
  shareNumerator: z.number().int().positive(),
  shareDenominator: z.number().int().positive(),
  earnedAt: z.iso.datetime({ offset: true }),
  status: CommissionTransactionStatusSchema,
  idempotencyKey: z.string().min(1).max(255),
  reconciliationBatchId: ReconciliationBatchIdSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CommissionTransactionListQuerySchema = z.object({
  candidateId: z.uuid().optional(),
  jobId: z.uuid().optional(),
  beneficiaryUserId: z.uuid().optional(),
  milestone: CommissionMilestoneSchema.optional(),
  status: CommissionTransactionStatusSchema.optional(),
  reconciliationBatchId: ReconciliationBatchIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const CommissionTransactionListResponseSchema = z.object({
  items: z.array(CommissionTransactionSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

const PayoutDateSchema = z.iso.date().superRefine((value, context) => {
  const day = Number(value.slice(8, 10));
  if (day !== 5 && day !== 15) {
    context.addIssue({
      code: 'custom',
      message: 'payableOn must be a stakeholder payout day (5 or 15)',
    });
  }
});

export const CreateReconciliationBatchSchema = z
  .object({
    id: ReconciliationBatchIdSchema,
    payableOn: PayoutDateSchema,
    transactionIds: z.array(CommissionTransactionIdSchema).min(1).max(500),
  })
  .superRefine((value, context) => {
    if (new Set(value.transactionIds).size !== value.transactionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['transactionIds'],
        message: 'transactionIds must not contain duplicates',
      });
    }
  });

export const ReconciliationBatchSchema = z.object({
  id: ReconciliationBatchIdSchema,
  payableOn: z.iso.date(),
  milestone: CommissionMilestoneSchema,
  currency: z.string().length(3),
  transactionCount: z.number().int().positive(),
  totalAmountMinor: safeMoneyMinor,
  status: ReconciliationBatchStatusSchema,
  createdByUserId: z.uuid(),
  paidByUserId: z.uuid().nullable(),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const ReconciliationBatchDetailSchema = ReconciliationBatchSchema.extend({
  transactionIds: z.array(CommissionTransactionIdSchema).min(1),
});

export const ReconciliationBatchListQuerySchema = z.object({
  status: ReconciliationBatchStatusSchema.optional(),
  milestone: CommissionMilestoneSchema.optional(),
  payableOn: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const ReconciliationBatchListResponseSchema = z.object({
  items: z.array(ReconciliationBatchSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type CommissionMilestone = z.infer<typeof CommissionMilestoneSchema>;
export type CommissionTransactionStatus = z.infer<typeof CommissionTransactionStatusSchema>;
export type CommissionTransaction = z.infer<typeof CommissionTransactionSchema>;
export type CommissionTransactionListQuery = z.infer<typeof CommissionTransactionListQuerySchema>;
export type CommissionTransactionListResponse = z.infer<
  typeof CommissionTransactionListResponseSchema
>;
export type CreateReconciliationBatchInput = z.infer<typeof CreateReconciliationBatchSchema>;
export type ReconciliationBatchStatus = z.infer<typeof ReconciliationBatchStatusSchema>;
export type ReconciliationBatch = z.infer<typeof ReconciliationBatchSchema>;
export type ReconciliationBatchDetail = z.infer<typeof ReconciliationBatchDetailSchema>;
export type ReconciliationBatchListQuery = z.infer<typeof ReconciliationBatchListQuerySchema>;
export type ReconciliationBatchListResponse = z.infer<
  typeof ReconciliationBatchListResponseSchema
>;
