# RecruitOps — Master Implementation Plan

> This is the single execution checklist for the repository.
> Never duplicate tasks into another roadmap/checklist.
> Tick an item only after the work is completed and verified.

## Phase 0 — Discovery, governance and repository bootstrap

- [x] Review stakeholder recruitment workflow source.
- [x] Consolidate product scope into a PRD.
- [x] Define target FE/BE/data/queue/automation architecture.
- [x] Define mandatory Agent Skill registry.
- [x] Define mandatory agent governance rules.
- [x] Define documentation-as-code rules.
- [x] Define Mermaid diagram policy.
- [x] Define social integration compliance policy.
- [x] Define n8n architectural boundary.
- [x] Define initial ADRs for monorepo, social adapters and n8n ownership.
- [x] Design senior-level repository structure.
- [x] Generate local repository scaffold.
- [x] Create GitHub repository `vitoo16/recruitops-platform`.
- [x] Push initial scaffold to `main`.
- [x] Verify repository default branch is `main`.
- [ ] Configure repository branch/ruleset protections where supported.
- [ ] Run AutoSkills dry-run in the created repository.
- [ ] Install/verify stack-detected skills.
- [ ] Install/verify required manual skills from `.agents/SKILL_REGISTRY.md`.

## Phase 1 — Monorepo and local development foundation

- [x] Initialize pnpm/Turborepo workspace.
- [x] Initialize `apps/web` with Next.js + TypeScript strict mode.
- [x] Initialize `apps/api` with NestJS + TypeScript strict mode.
- [x] Initialize `apps/worker`.
- [x] Initialize shared packages.
- [x] Configure shared TypeScript and formatting baseline.
- [x] Configure environment validation baseline.
- [x] Add PostgreSQL local service.
- [x] Add Redis local service.
- [ ] Add object-storage local development strategy.
- [x] Initialize Prisma.
- [x] Add baseline health endpoint.
- [x] Configure structured request logging/correlation IDs baseline.
- [x] Add initial CI workflow.
- [x] Add reproducible free-tier deployment configuration for frontend/API and document Supabase/Render Key Value dependencies.
- [x] Provision Supabase Free project in Singapore and create the `recruitops-private` private storage bucket.
- [x] Provision Render Key Value Free (`recruitops-redis`) in Singapore.
- [x] Verify Render Static Site Free deployment for `recruitops-frontend`.
- [x] Verify Render Web Service Free deployment for `recruitops-api`.
- [x] Verify clean install, formatting, typecheck, test and build in CI.

## Phase 2 — Authentication, users and security foundation

- [ ] Finalize auth approach via ADR if needed.
- [ ] Implement authentication.
- [ ] Implement RBAC.
- [ ] Implement secure session/token handling.
- [ ] Implement audit logging baseline.
- [ ] Add secret-management/deployment rules.
- [ ] Add private file-access strategy.
- [ ] Add security regression tests.

## Phase 3 — Job Hub and content domain

- [ ] Implement Job schema/domain.
- [ ] Implement Job API.
- [ ] Implement Job management UI.
- [ ] Implement content Post domain.
- [ ] Implement PostVariant domain.
- [ ] Implement media model/upload flow.
- [ ] Implement draft workflow.
- [ ] Implement platform preview model.
- [x] Implement VI/EN application i18n baseline.
- [ ] Implement job/content validation tests.
- [ ] Update ERD/API docs and diagrams.

## Phase 4 — Destinations and social account connections

- [ ] Implement Destination domain.
- [ ] Implement destination tagging/filtering.
- [ ] Implement SocialAccount domain.
- [ ] Implement secure OAuth credential storage.
- [ ] Verify current Meta official APIs/scopes and implement supported connection flow.
- [ ] Verify current LinkedIn official APIs/scopes and implement supported connection flow.
- [ ] Verify current TikTok official APIs/scopes and implement supported connection flow.
- [ ] Verify current Zalo official APIs/scopes and implement supported connection flow.
- [ ] Implement reconnect/expired-token UX.
- [ ] Add integration health status.

## Phase 5 — Publishing and scheduling core

- [ ] Implement vendor-neutral `SocialPublisher` contracts.
- [ ] Implement Publication model/state machine.
- [ ] Implement BullMQ scheduling.
- [ ] Implement idempotency keys.
- [ ] Implement retry/backoff/terminal-failure behavior.
- [ ] Implement rate-limit-aware worker boundaries.
- [ ] Implement Facebook Page adapter for currently supported official capabilities.
- [ ] Implement Instagram adapter for currently supported official capabilities.
- [ ] Implement Threads adapter for currently supported official capabilities.
- [ ] Implement LinkedIn adapter for currently supported official capabilities.
- [ ] Implement TikTok adapter for currently supported official capabilities.
- [ ] Implement Zalo adapter for currently supported official capabilities.
- [ ] Implement Manual Assist provider for unsupported destinations such as arbitrary groups where official APIs do not allow posting.
- [ ] Implement publish-now UI.
- [ ] Implement schedule UI/calendar.
- [ ] Implement publication status/error/retry UI.
- [ ] Add integration and E2E coverage.
- [ ] Update sequence/state diagrams and runbooks.

## Phase 6 — Candidate CRM and CV handling

- [ ] Implement Candidate domain.
- [ ] Implement Application domain.
- [ ] Implement private CV storage.
- [ ] Implement validated CV upload/download flow.
- [ ] Implement candidate source attribution.
- [ ] Implement candidate deduplication strategy.
- [ ] Implement candidate/application UI.
- [ ] Implement recruitment lifecycle.
- [ ] Add PII authorization tests.
- [ ] Update ERD/security docs.

## Phase 7 — Commission ledger and reconciliation

- [ ] Confirm final stakeholder commission/payment rules before implementation.
- [ ] Implement CommissionTransaction ledger.
- [ ] Implement duplicate-CV commission handling.
- [ ] Implement ReconciliationBatch.
- [ ] Implement commission dashboard.
- [ ] Implement export/reconciliation workflow.
- [ ] Add financial precision/audit tests.

## Phase 8 — n8n automation

- [ ] Initialize version-controlled n8n workflow directory/export process.
- [ ] Implement candidate submission email workflow.
- [ ] Implement active-job sheet synchronization.
- [ ] Implement token/integration health notifications.
- [ ] Implement daily/weekly HR operations report.
- [ ] Implement candidate follow-up workflow if approved.
- [ ] Add n8n failure/recovery handling.
- [ ] Document trigger/input/output/credentials/retry/owner for every workflow.
- [ ] Validate, test, publish and hand off each workflow.

## Phase 9 — Observability, hardening and scale

- [ ] Add frontend error monitoring.
- [ ] Add API/worker error monitoring.
- [ ] Add tracing/correlation across API → queue → worker → provider.
- [ ] Add queue metrics and alerts.
- [ ] Add provider latency/error/rate-limit telemetry.
- [ ] Add database performance review/indexes.
- [ ] Add dependency/security scanning.
- [ ] Add backup/restore procedure.
- [x] Add initial free-tier deployment topology and upgrade path.
- [ ] Add platform-specific worker scaling strategy.
- [ ] Execute accessibility review.
- [ ] Execute web performance review.
- [ ] Execute security review.
- [ ] Execute production readiness review.

## Completion rule

Do not add a new checklist item if an existing item already represents the work.
Refine the existing item instead. This prevents duplicated implementation.
