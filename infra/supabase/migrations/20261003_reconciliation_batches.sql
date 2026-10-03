-- Phase 7 reconciliation batch snapshot and payout lifecycle.
-- Stakeholder payout classes are documented in docs/product/commission-rules.md:
-- day 5 = interview commission; day 15 = worked-30-days commission.

CREATE TYPE "ReconciliationBatchStatus" AS ENUM ('OPEN', 'PAID');

CREATE TABLE public.reconciliation_batches (
  "id" UUID NOT NULL,
  "payableOn" DATE NOT NULL,
  "milestone" "CommissionMilestone" NOT NULL,
  "currency" TEXT NOT NULL,
  "transactionCount" INTEGER NOT NULL,
  "totalAmountMinor" BIGINT NOT NULL,
  "status" "ReconciliationBatchStatus" NOT NULL DEFAULT 'OPEN',
  "createdByUserId" UUID NOT NULL,
  "paidByUserId" UUID,
  "paidAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "reconciliation_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliation_batches_currency_check"
    CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "reconciliation_batches_transaction_count_positive"
    CHECK ("transactionCount" > 0),
  CONSTRAINT "reconciliation_batches_total_nonnegative"
    CHECK ("totalAmountMinor" >= 0),
  CONSTRAINT "reconciliation_batches_payout_day_check"
    CHECK (EXTRACT(DAY FROM "payableOn") IN (5, 15)),
  CONSTRAINT "reconciliation_batches_payout_class_check"
    CHECK (
      (EXTRACT(DAY FROM "payableOn") = 5 AND "milestone" = 'INTERVIEW_INVITED')
      OR
      (EXTRACT(DAY FROM "payableOn") = 15 AND "milestone" = 'WORKED_30_DAYS')
    ),
  CONSTRAINT "reconciliation_batches_paid_state_check"
    CHECK (
      ("status" = 'OPEN' AND "paidAt" IS NULL AND "paidByUserId" IS NULL)
      OR
      ("status" = 'PAID' AND "paidAt" IS NOT NULL AND "paidByUserId" IS NOT NULL)
    )
);

CREATE INDEX "reconciliation_batches_status_payableOn_idx"
  ON public.reconciliation_batches ("status", "payableOn");
CREATE INDEX "reconciliation_batches_milestone_payableOn_idx"
  ON public.reconciliation_batches ("milestone", "payableOn");

ALTER TABLE public.commission_transactions
  ADD COLUMN "reconciliationBatchId" UUID;

CREATE INDEX "commission_transactions_reconciliationBatchId_idx"
  ON public.commission_transactions ("reconciliationBatchId");

ALTER TABLE public.commission_transactions
  ADD CONSTRAINT "commission_transactions_reconciliationBatchId_fkey"
  FOREIGN KEY ("reconciliationBatchId")
  REFERENCES public.reconciliation_batches("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE public.reconciliation_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reconciliation_batches FROM anon, authenticated;
