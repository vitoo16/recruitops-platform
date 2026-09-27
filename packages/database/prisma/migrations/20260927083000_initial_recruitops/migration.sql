-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'THREADS', 'LINKEDIN', 'TIKTOK', 'ZALO');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('PAGE', 'PROFILE', 'GROUP', 'ORGANIZATION', 'OA', 'OTHER');

-- CreateEnum
CREATE TYPE "PostingMode" AS ENUM ('API', 'MANUAL');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHING', 'PROCESSING', 'PUBLISHED', 'RETRY_WAITING', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SOURCED', 'SUBMITTED', 'INTERVIEW_INVITED', 'INTERVIEWED', 'REJECTED', 'HIRED', 'WORKING', 'WORKED_30_DAYS', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "CandidateDocumentKind" AS ENUM ('CV', 'OTHER');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "salaryMinMinor" BIGINT,
    "salaryMaxMinor" BIGINT,
    "sourceRef" TEXT,
    "commissionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "baseContent" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_variants" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "text" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "link" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "altText" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "credentialRef" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "type" "DestinationType" NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "postingMode" "PostingMode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "socialAccountId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "postVariantId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "socialAccountId" UUID,
    "state" "PublicationState" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "nextRetryAt" TIMESTAMPTZ(6),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "externalPostId" TEXT,
    "externalUrl" TEXT,
    "providerRequestId" TEXT,
    "correlationId" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SOURCED',
    "sourcePlatform" "SocialPlatform",
    "sourceDestinationId" UUID,
    "sourceLabel" TEXT,
    "sourcedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "interviewAt" TIMESTAMPTZ(6),
    "hiredAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "worked30DaysAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "applicationId" UUID,
    "kind" "CandidateDocumentKind" NOT NULL DEFAULT 'CV',
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_updatedAt_idx" ON "jobs"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "jobs_employmentType_idx" ON "jobs"("employmentType");

-- CreateIndex
CREATE INDEX "posts_jobId_idx" ON "posts"("jobId");

-- CreateIndex
CREATE INDEX "posts_status_updatedAt_idx" ON "posts"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "post_variants_postId_idx" ON "post_variants"("postId");

-- CreateIndex
CREATE INDEX "post_variants_platform_idx" ON "post_variants"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "post_variants_postId_platform_key" ON "post_variants"("postId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_postId_createdAt_idx" ON "media_assets"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "media_assets_kind_idx" ON "media_assets"("kind");

-- CreateIndex
CREATE INDEX "social_accounts_platform_status_idx" ON "social_accounts"("platform", "status");

-- CreateIndex
CREATE INDEX "social_accounts_expiresAt_idx" ON "social_accounts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_externalAccountId_key" ON "social_accounts"("platform", "externalAccountId");

-- CreateIndex
CREATE INDEX "destinations_platform_enabled_idx" ON "destinations"("platform", "enabled");

-- CreateIndex
CREATE INDEX "destinations_postingMode_enabled_idx" ON "destinations"("postingMode", "enabled");

-- CreateIndex
CREATE INDEX "destinations_socialAccountId_idx" ON "destinations"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "publications_idempotencyKey_key" ON "publications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "publications_state_scheduledAt_idx" ON "publications"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX "publications_state_nextRetryAt_idx" ON "publications"("state", "nextRetryAt");

-- CreateIndex
CREATE INDEX "publications_postVariantId_idx" ON "publications"("postVariantId");

-- CreateIndex
CREATE INDEX "publications_destinationId_idx" ON "publications"("destinationId");

-- CreateIndex
CREATE INDEX "publications_socialAccountId_idx" ON "publications"("socialAccountId");

-- CreateIndex
CREATE INDEX "publications_externalPostId_idx" ON "publications"("externalPostId");

-- CreateIndex
CREATE INDEX "candidates_emailNormalized_idx" ON "candidates"("emailNormalized");

-- CreateIndex
CREATE INDEX "candidates_phoneNormalized_idx" ON "candidates"("phoneNormalized");

-- CreateIndex
CREATE INDEX "candidates_updatedAt_idx" ON "candidates"("updatedAt");

-- CreateIndex
CREATE INDEX "applications_candidateId_updatedAt_idx" ON "applications"("candidateId", "updatedAt");

-- CreateIndex
CREATE INDEX "applications_jobId_status_idx" ON "applications"("jobId", "status");

-- CreateIndex
CREATE INDEX "applications_sourcePlatform_idx" ON "applications"("sourcePlatform");

-- CreateIndex
CREATE INDEX "applications_sourceDestinationId_idx" ON "applications"("sourceDestinationId");

-- CreateIndex
CREATE INDEX "applications_status_updatedAt_idx" ON "applications"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_documents_storageKey_key" ON "candidate_documents"("storageKey");

-- CreateIndex
CREATE INDEX "candidate_documents_candidateId_createdAt_idx" ON "candidate_documents"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_documents_applicationId_idx" ON "candidate_documents"("applicationId");

-- CreateIndex
CREATE INDEX "candidate_documents_kind_idx" ON "candidate_documents"("kind");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_variants" ADD CONSTRAINT "post_variants_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_postVariantId_fkey" FOREIGN KEY ("postVariantId") REFERENCES "post_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_sourceDestinationId_fkey" FOREIGN KEY ("sourceDestinationId") REFERENCES "destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

