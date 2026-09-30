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
- [x] Run AutoSkills dry-run in the created repository.
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
- [x] Add object-storage local development strategy.
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

- [x] Finalize auth approach via ADR if needed.
- [x] Implement authentication.
- [x] Implement RBAC.
- [x] Implement secure session/token handling.
- [x] Implement audit logging baseline.
- [x] Add secret-management/deployment rules.
- [x] Add private file-access strategy.
- [x] Add security regression tests.

## Phase 3 — Job Hub and content domain

- [x] Implement Job schema/domain.
- [x] Implement Job API.
- [x] Implement Job management UI.
- [x] Implement content Post domain.
- [x] Implement PostVariant domain.
- [x] Complete media model/upload flow.
- [x] Implement draft workflow.
- [x] Implement platform preview model.
- [x] Implement VI/EN application i18n baseline.
- [x] Implement job/content validation tests.
- [x] Update ERD/API docs and diagrams.

## Phase 4 — Destinations and social account connections

- [x] Implement Destination domain.
- [x] Implement destination tagging/filtering.
- [x] Implement SocialAccount domain.
- [x] Implement secure OAuth credential storage (encrypted storage code/tests, hosted `social_credentials` migration, RLS/browser-role revocation and production encryption keyring verified).
- [ ] Verify current Meta official APIs/scopes and implement supported connection flow (provider boundary, one-time OAuth state, encrypted discovery session, fixed frontend callback handoff, localized explicit account picker, authenticated credential promotion, reconnect UX and regression tests implemented; hosted credential migration/keyring and frontend/API deploys are verified, while production `DATABASE_URL`, real `META_CLIENT_ID`/`META_CLIENT_SECRET`, Meta app access configuration and real-provider integration/E2E verification remain pending).
- [ ] Verify current LinkedIn official APIs/scopes and implement supported connection flow (current 3-legged member OAuth code-side path implemented with `openid profile w_member_social`, one-time hashed state, encrypted member credential promotion, reconnect-safe account/destination upsert, OWNER/ADMIN connection UI and VI/EN copy; real LinkedIn app/product access, hosted credentials, live provider integration/E2E and organization capability remain pending).
- [ ] Verify current TikTok official APIs/scopes and implement supported connection flow (current Login Kit Web code-side path implemented with `user.info.basic,video.publish`, one-time hashed state, token/profile `open_id` verification, encrypted access+refresh credential promotion, reconnect-safe account/destination upsert, refresh-token provider primitive, OWNER/ADMIN connection UI and VI/EN copy; real TikTok app/product access, hosted credentials, `video.publish` approval, Content Posting API audit, durable refresh orchestration and live provider integration/E2E remain pending).
- [ ] Verify current Zalo official APIs/scopes and implement supported connection flow.
- [x] Implement reconnect/expired-token UX.
- [x] Add integration health status.

## Phase 5 — Publishing and scheduling core

- [x] Implement vendor-neutral `SocialPublisher` contracts.
- [x] Implement Publication model/state machine.
- [x] Implement BullMQ scheduling primitive (delayed enqueue, duplicate-safe job identity, bounded retry/backoff; provider execution remains separately gated).
- [x] Implement idempotency keys.
- [x] Implement retry/backoff/terminal-failure behavior.
- [x] Implement rate-limit-aware worker boundary (validated queue payloads, configurable concurrency/BullMQ limiter, compare-and-set publication execution state orchestration, Prisma execution projection/CAS persistence, shared OAuth credential decryption, Facebook production publisher runtime and graceful worker startup/shutdown implemented; explicit ordered PostVariant media-selection model/API/UI and worker media-ID projection implemented; provider-readable private-media resolver with bounded server-side Supabase signed URLs implemented; Instagram and Threads worker context/registry wiring are implemented behind fail-closed opt-in activation flags, while hosted activation, deployed-worker verification and real-provider integration/E2E remain gated).
- [x] Implement Facebook Page adapter for currently supported official capabilities (verified text/link Page feed publishing slice; private-media publishing remains a later capability).
- [x] Implement Instagram adapter for currently supported official capabilities (single-image and Reel container/publish flow with bounded Reel readiness polling, private-media resolver boundary, credential context resolver and opt-in worker registry wiring implemented; hosted activation and real-provider E2E remain pending).
- [ ] Implement Threads adapter for currently supported official capabilities (official create-container → publish-container single-post adapter for text/image/video, private-media resolver boundary, credential context resolver, opt-in worker registry wiring, dedicated Authorization Code OAuth flow, one-time state, encrypted long-lived credential promotion, reconnect-safe account/destination upsert, manual long-lived credential refresh with optimistic concurrency, Threads integration-health reporting, reconnect-required lifecycle handling and VI/EN connection UI implemented; real Threads app credentials/access, hosted activation, real-provider refresh/publishing integration/E2E verification and the intended advanced capability set remain pending).
- [ ] Implement LinkedIn adapter for currently supported official capabilities (member text/hashtag/link Posts API adapter, execution-time encrypted credential resolver, `w_member_social` scope enforcement, fail-closed worker activation, current versioned API configuration and regression coverage implemented; hosted activation, real LinkedIn app/product credentials, provider integration/E2E, media upload and organization-role capability remain pending).
- [ ] Implement TikTok adapter for currently supported official capabilities.
- [ ] Implement Zalo adapter for currently supported official capabilities.
- [x] Implement Manual Assist provider for unsupported destinations such as arbitrary groups where official APIs do not allow posting.
- [x] Implement publish-now UI (READY-post readiness, explicit eligible API destination selection, retry-stable Publication UUID and durable BullMQ queue acceptance implemented with VI/EN operator feedback).
- [x] Implement schedule UI/calendar (future absolute-instant scheduling, browser-timezone disclosure, native date/time controls, API eligibility revalidation, known-account-expiry guard, retry-stable Publication UUID, delayed BullMQ enqueue and persisted upcoming `SCHEDULED` calendar with overdue operational signal implemented).
- [x] Implement publication status/error/retry UI (bounded recent status history, sanitized errors, automatic retry timing, FAILED-only manual retry, BullMQ failed-job retry/re-enqueue reconciliation and ambiguous-outcome manual-review gate implemented).
- [x] Add integration and E2E coverage.
- [x] Update sequence/state diagrams and runbooks.

## Phase 6 — Candidate CRM and CV handling

- [x] Implement Candidate domain.
- [x] Implement Application domain.
- [x] Implement private CV storage.
- [x] Implement validated CV upload/download flow.
- [x] Implement candidate source attribution.
- [x] Implement candidate deduplication strategy.
- [x] Implement candidate/application UI.
- [x] Implement recruitment lifecycle.
- [x] Add PII authorization tests.
- [x] Update ERD/security docs.

## Phase 7 — Commission ledger and reconciliation

- [x] Confirm final stakeholder commission/payment rules before implementation (locked to the stakeholder-provided CTV recruitment document in `docs/product/commission-rules.md`; exact per-job amounts remain operational master-sheet data rather than invented defaults).
- [x] Implement CommissionTransaction ledger (job-level interview/30-day commission configuration, authenticated application source attribution, dedicated interview-invited milestone timestamp, integer-minor-unit/idempotent ledger persistence, hosted migration/RLS, OWNER/ADMIN read API, precision checks and docs implemented; automatic accrual intentionally waits for duplicate-CV allocation logic).
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

- [x] Add frontend error monitoring (optional static-export browser exception monitoring uses conditional `@sentry/browser` loading behind `NEXT_PUBLIC_SENTRY_DSN`, explicit global/React capture, PII-prone context scrubbing, no replay/tracing/log/breadcrumb integrations, accessible fallback and regression coverage while preserving the established public-shell performance budget; hosted DSN/source-map production configuration remains a production-readiness concern).
- [x] Add API/worker error monitoring (optional `@sentry/node` monitoring captures API handler/bootstrap failures and worker startup/shutdown/process failures, strips SDK-native user/request context before transmission, keeps only bounded safe service/correlation/operation tags, flushes on bounded shutdown/startup-failure paths, and remains a no-op without `SENTRY_DSN` with regression coverage).
- [x] Add tracing/correlation across API → queue → worker → provider (normalized bounded request IDs are persisted on Publication, propagated in BullMQ jobs, validated by the worker, forwarded through vendor-neutral `PublishCommand`, and reused for manual/automatic retry chains with regression coverage).
- [x] Add queue metrics and alerts (read-only BullMQ job-count sampling emits waiting/active/delayed/failed/outstanding metrics; configurable waiting/failed thresholds emit structured alerts; observer Redis access is lazy, separately closable and does not mutate queue state or block worker startup).
- [x] Add provider latency/error/rate-limit telemetry (vendor-neutral publisher registry wrapper emits structured operation latency/outcome telemetry, classifies HTTP 429 as rate-limited, carries publication correlation where available, excludes provider payload/secrets/PII, and isolates telemetry sink failures from publishing semantics with regression coverage).
- [x] Add database performance review/indexes.
- [x] Add dependency/security scanning.
- [x] Add backup/restore procedure.
- [x] Add initial free-tier deployment topology and upgrade path.
- [x] Add platform-specific worker scaling strategy.
- [x] Execute accessibility review (automated Playwright + axe WCAG A/AA gate passes for VI/EN public shell, keyboard skip-link behavior is covered, and review findings/limitations are documented; future UI changes remain subject to the same repository accessibility gates).
- [x] Execute web performance review.
- [x] Execute security review (OWASP/Supabase-aligned review verified implemented authentication/RBAC, OAuth state and credential-storage boundaries, private Storage RLS, monitoring privacy and scanning controls; hardened exact-origin non-credentialed CORS with regression coverage; production-readiness carryovers are documented for hosted Data API grants, authoritative private-upload limits, shared API rate limiting, CSP, and candidate retention/deletion policy).
- [x] Execute production readiness review (review completed against repository release gates and current deployment/security evidence; release decision remains **NOT READY** until branch protection, hosted security findings, always-on worker/runtime readiness, live-provider verification, monitoring deployment, retention policy and release-scope blockers are resolved as documented in `docs/operations/production-readiness-review.md`).

## Completion rule

Do not add a new checklist item if an existing item already represents the work.
Refine the existing item instead. This prevents duplicated implementation.
