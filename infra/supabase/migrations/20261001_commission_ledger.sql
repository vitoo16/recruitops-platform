-- Commission ledger and reconciliation foundation.
-- Business source: Lucky Life CTV recruitment brief.
-- Amounts remain configurable per Job because the referenced detailed commission sheet is not part of the repository/library.

CREATE TYPE "CommissionEventType" AS ENUM ('INTERVIEW_INVITED', 'WORKED_30_DAYS');
CREATE TYPE "CommissionTransactionStatus" AS ENUM ('EARNED', 'PAYABLE', 'PAID');
CREATE TYPE "ReconciliationBatchStatus" AS ENUM ('OPEN', 'PAID');

ALTER TABLE "jobs"
  ADD COLUMN "interviewCommissionMinor" BIGINT,
  ADD COLUMN "worked30DaysCommissionMinor" BIGINT;

ALTER TABLE "applications"
  ADD COLUMN "sourcedByActorId" UUID;

CREATE INDEX "applications_candidateId_jobId_sourcedAt_idx"
  ON "applications"("candidateId", "jobId", "sourcedAt");
CREATE INDEX "applications_sourcedByActorId_idx"
  ON "applications"("sourcedByActorId");

CREATE TABLE "reconciliation_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payableOn" TIMESTAMPTZ(6) NOT NULL,
  "status" "ReconciliationBatchStatus" NOT NULL DEFAULT 'OPEN',
  "createdByActorId" UUID NOT NULL,
  "paidAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reconciliation_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reconciliation_batches_payableOn_key"
  ON "reconciliation_batches"("payableOn");
CREATE INDEX "reconciliation_batches_status_payableOn_idx"
  ON "reconciliation_batches"("status", "payableOn");

CREATE TABLE "commission_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "beneficiaryActorId" UUID NOT NULL,
  "eventType" "CommissionEventType" NOT NULL,
  "allocationKey" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "grossAmountMinor" BIGINT NOT NULL,
  "splitCount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "CommissionTransactionStatus" NOT NULL DEFAULT 'EARNED',
  "earnedAt" TIMESTAMPTZ(6) NOT NULL,
  "payableAt" TIMESTAMPTZ(6) NOT NULL,
  "paidAt" TIMESTAMPTZ(6),
  "reconciliationBatchId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commission_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_transactions_amount_nonnegative" CHECK ("amountMinor" >= 0),
  CONSTRAINT "commission_transactions_gross_nonnegative" CHECK ("grossAmountMinor" >= 0),
  CONSTRAINT "commission_transactions_split_positive" CHECK ("splitCount" > 0)
);

CREATE UNIQUE INDEX "commission_transactions_allocationKey_beneficiaryActorId_key"
  ON "commission_transactions"("allocationKey", "beneficiaryActorId");
CREATE INDEX "commission_transactions_applicationId_idx"
  ON "commission_transactions"("applicationId");
CREATE INDEX "commission_transactions_beneficiaryActorId_status_idx"
  ON "commission_transactions"("beneficiaryActorId", "status");
CREATE INDEX "commission_transactions_status_payableAt_idx"
  ON "commission_transactions"("status", "payableAt");
CREATE INDEX "commission_transactions_reconciliationBatchId_idx"
  ON "commission_transactions"("reconciliationBatchId");

ALTER TABLE "commission_transactions"
  ADD CONSTRAINT "commission_transactions_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_transactions"
  ADD CONSTRAINT "commission_transactions_reconciliationBatchId_fkey"
  FOREIGN KEY ("reconciliationBatchId") REFERENCES "reconciliation_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- API-owned financial tables: browser Data API access is explicitly denied.
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.reconciliation_batches FROM anon, authenticated;
