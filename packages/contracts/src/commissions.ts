import { z } from 'zod';

export const commissionMilestoneValues = ['INTERVIEW_INVITED', 'WORKED_30_DAYS'] as const;
export const commissionTransactionStatusValues = ['ACCRUED', 'BATCHED', 'PAID', 'VOIDED'] as const;

export const CommissionMilestoneSchema = z.enum(commissionMilestoneValues);
export const CommissionTransactionStatusSchema = z.enum(commissionTransactionStatusValues);
export const CommissionTransactionIdSchema = z.uuid();

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
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CommissionTransactionListQuerySchema = z.object({
  candidateId: z.uuid().optional(),
  jobId: z.uuid().optional(),
  beneficiaryUserId: z.uuid().optional(),
  milestone: CommissionMilestoneSchema.optional(),
  status: CommissionTransactionStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const CommissionTransactionListResponseSchema = z.object({
  items: z.array(CommissionTransactionSchema),
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
