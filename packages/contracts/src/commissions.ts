import { z } from 'zod';

export const commissionEventTypeValues = ['INTERVIEW_INVITED', 'WORKED_30_DAYS'] as const;
export const commissionTransactionStatusValues = ['EARNED', 'PAYABLE', 'PAID'] as const;
export const reconciliationBatchStatusValues = ['OPEN', 'PAID'] as const;

export const CommissionEventTypeSchema = z.enum(commissionEventTypeValues);
export const CommissionTransactionStatusSchema = z.enum(commissionTransactionStatusValues);
export const ReconciliationBatchStatusSchema = z.enum(reconciliationBatchStatusValues);
export const CommissionTransactionIdSchema = z.uuid();
export const ReconciliationBatchIdSchema = z.uuid();

const moneyMinorSchema = z.number().int().nonnegative().safe();

export const CommissionTransactionSchema = z.object({
  id: CommissionTransactionIdSchema,
  applicationId: z.uuid(),
  beneficiaryActorId: z.uuid(),
  eventType: CommissionEventTypeSchema,
  allocationKey: z.string().min(1).max(255),
  amountMinor: moneyMinorSchema,
  grossAmountMinor: moneyMinorSchema,
  splitCount: z.number().int().positive(),
  currency: z.string().length(3),
  status: CommissionTransactionStatusSchema,
  earnedAt: z.iso.datetime({ offset: true }),
  payableAt: z.iso.datetime({ offset: true }),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  reconciliationBatchId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CommissionTransactionListQuerySchema = z.object({
  status: CommissionTransactionStatusSchema.optional(),
  eventType: CommissionEventTypeSchema.optional(),
  beneficiaryActorId: z.uuid().optional(),
  applicationId: z.uuid().optional(),
  reconciliationBatchId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const CommissionTransactionListResponseSchema = z.object({
  items: z.array(CommissionTransactionSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const ReconciliationBatchSchema = z.object({
  id: ReconciliationBatchIdSchema,
  payableOn: z.iso.datetime({ offset: true }),
  status: ReconciliationBatchStatusSchema,
  createdByActorId: z.uuid(),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  transactionCount: z.number().int().nonnegative(),
  totalAmountMinor: moneyMinorSchema.nullable(),
  currency: z.string().length(3).nullable(),
});

export const ReconciliationBatchListQuerySchema = z.object({
  status: ReconciliationBatchStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const ReconciliationBatchListResponseSchema = z.object({
  items: z.array(ReconciliationBatchSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const CreateReconciliationBatchSchema = z
  .object({
    payableOn: z.iso.date(),
  })
  .superRefine((value, context) => {
    const day = Number(value.payableOn.slice(8, 10));
    if (day !== 5 && day !== 15) {
      context.addIssue({
        code: 'custom',
        path: ['payableOn'],
        message: 'payableOn must be a stakeholder payment day (5 or 15)',
      });
    }
  });

export const CommissionAccrualSyncResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  skippedUnconfigured: z.number().int().nonnegative(),
  skippedUnattributed: z.number().int().nonnegative(),
  alreadyAccrued: z.number().int().nonnegative(),
});

export type CommissionEventType = z.infer<typeof CommissionEventTypeSchema>;
export type CommissionTransactionStatus = z.infer<typeof CommissionTransactionStatusSchema>;
export type CommissionTransaction = z.infer<typeof CommissionTransactionSchema>;
export type CommissionTransactionListQuery = z.infer<typeof CommissionTransactionListQuerySchema>;
export type CommissionTransactionListResponse = z.infer<
  typeof CommissionTransactionListResponseSchema
>;
export type ReconciliationBatchStatus = z.infer<typeof ReconciliationBatchStatusSchema>;
export type ReconciliationBatch = z.infer<typeof ReconciliationBatchSchema>;
export type ReconciliationBatchListQuery = z.infer<typeof ReconciliationBatchListQuerySchema>;
export type ReconciliationBatchListResponse = z.infer<typeof ReconciliationBatchListResponseSchema>;
export type CreateReconciliationBatchInput = z.infer<typeof CreateReconciliationBatchSchema>;
export type CommissionAccrualSyncResponse = z.infer<typeof CommissionAccrualSyncResponseSchema>;
