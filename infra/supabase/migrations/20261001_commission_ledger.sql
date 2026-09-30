-- Phase 7 commission ledger foundation.
-- Business rules are documented in docs/product/commission-rules.md.

CREATE TYPE "CommissionMilestone" AS ENUM ('INTERVIEW_INVITED', 'WORKED_30_DAYS');
CREATE TYPE "CommissionTransactionStatus" AS ENUM ('ACCRUED', 'BATCHED', 'PAID', 'VOIDED');

ALTER TABLE public.jobs
  ADD COLUMN "interviewCommissionMinor" BIGINT,
  ADD COLUMN "worked30DaysCommissionMinor" BIGINT,
  ADD CONSTRAINT "jobs_interview_commission_nonnegative"
    CHECK ("interviewCommissionMinor" IS NULL OR "interviewCommissionMinor" >= 0),
  ADD CONSTRAINT "jobs_worked30_commission_nonnegative"
    CHECK ("worked30DaysCommissionMinor" IS NULL OR "worked30DaysCommissionMinor" >= 0);

ALTER TABLE public.applications
  ADD COLUMN "sourceUserId" UUID,
  ADD COLUMN "interviewInvitedAt" TIMESTAMPTZ(6);

CREATE INDEX "applications_candidateId_jobId_sourcedAt_idx"
  ON public.applications ("candidateId", "jobId", "sourcedAt");
CREATE INDEX "applications_sourceUserId_sourcedAt_idx"
  ON public.applications ("sourceUserId", "sourcedAt");

CREATE TABLE public.commission_transactions (
  "id" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "beneficiaryUserId" UUID NOT NULL,
  "milestone" "CommissionMilestone" NOT NULL,
  "currency" TEXT NOT NULL,
  "baseAmountMinor" BIGINT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "shareNumerator" INTEGER NOT NULL DEFAULT 1,
  "shareDenominator" INTEGER NOT NULL DEFAULT 1,
  "earnedAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "CommissionTransactionStatus" NOT NULL DEFAULT 'ACCRUED',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "commission_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_transactions_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "commission_transactions_currency_check"
    CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "commission_transactions_base_amount_nonnegative" CHECK ("baseAmountMinor" >= 0),
  CONSTRAINT "commission_transactions_amount_nonnegative" CHECK ("amountMinor" >= 0),
  CONSTRAINT "commission_transactions_share_numerator_positive" CHECK ("shareNumerator" > 0),
  CONSTRAINT "commission_transactions_share_denominator_positive" CHECK ("shareDenominator" > 0),
  CONSTRAINT "commission_transactions_share_fraction_valid"
    CHECK ("shareNumerator" <= "shareDenominator")
);

CREATE INDEX "commission_transactions_candidateId_jobId_milestone_idx"
  ON public.commission_transactions ("candidateId", "jobId", "milestone");
CREATE INDEX "commission_transactions_applicationId_idx"
  ON public.commission_transactions ("applicationId");
CREATE INDEX "commission_transactions_beneficiaryUserId_status_earnedAt_idx"
  ON public.commission_transactions ("beneficiaryUserId", "status", "earnedAt");
CREATE INDEX "commission_transactions_status_earnedAt_idx"
  ON public.commission_transactions ("status", "earnedAt");

ALTER TABLE public.commission_transactions
  ADD CONSTRAINT "commission_transactions_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES public.candidates("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_transactions_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES public.jobs("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_transactions_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES public.applications("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Commission data is API-owned financial data. No browser Data API policy is granted.
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;
