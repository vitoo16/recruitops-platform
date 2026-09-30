# RecruitOps Security Review — 2026-09-30

## Scope and method

This review covers the repository and currently provisioned Supabase project for the implemented RecruitOps surface: authentication/RBAC, API authorization, OAuth connection state and credential storage, private candidate files, public/static frontend controls, CORS, logging/monitoring, dependency/code scanning, and the API/worker integration boundaries.

The review uses the repository security baseline plus the OWASP API Security Top 10 (2023) as the primary application/API threat checklist. Supabase-specific checks follow current Supabase RLS and Storage guidance. The repository-mandated OWASP Agent Skill was not available in the execution environment, so the documented repository fallback was used: current official security guidance plus executable repository controls.

## Verified controls

| Area | Result | Evidence / boundary |
| --- | --- | --- |
| Authentication | Pass | API routes use Supabase bearer-token verification through the authenticated `/auth/v1/user` boundary; invalid/missing tokens fail closed. |
| Function-level authorization | Pass | Protected controllers use `AuthGuard`/`RolesGuard`; security regression tests lock candidate/application/CV role matrices. |
| OAuth CSRF/replay | Pass for implemented code-side flows | Provider starts create cryptographically random state; callbacks consume one-time expiring state before token exchange. Live provider credentials/approval/E2E remain separate integration-readiness work. |
| OAuth credential storage | Pass | Provider credentials are server-side only and persisted as AES-256-GCM envelopes with fresh IVs/key IDs; `social_credentials` has RLS enabled and browser table privileges are revoked. |
| Candidate/CV API authorization | Pass | Candidate/Application routes enforce documented role boundaries; candidate document metadata excludes VIEWER mutation/list access. |
| Private storage visibility | Pass | Hosted `recruitops-private` bucket is private (`public = false`), and hosted `storage.objects` policies restrict access to the authenticated user's object prefix or trusted `app_metadata.recruitops_role` OWNER/ADMIN claims. |
| Logging/monitoring | Pass | Request logging uses safe paths/correlation IDs; server/browser Sentry boundaries strip PII-prone request/user/context fields and remain optional. |
| Dependency/code scanning | Pass | `pnpm audit --audit-level=moderate`, CodeQL `security-extended`, Dependabot, secret scanning guardrails and normal CI gates are present. |
| API security headers | Pass | Nest security headers are enabled globally. OAuth callbacks additionally use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| Static frontend baseline headers | Partial | Render config sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY`. A production CSP is not yet deployed. |

## Findings and remediation status

### SR-01 — Credentialed / weakly validated CORS configuration — fixed in this review

**Risk:** medium security-misconfiguration risk.

The API used `credentials: true` even though RecruitOps API clients authenticate with explicit bearer tokens and do not use API cookies. `CORS_ORIGINS` previously accepted arbitrary comma-separated strings without origin-shape validation.

**Remediation in this review:**

- credentialed CORS is disabled;
- origins must be absolute HTTP(S) origins only;
- credentials in origins, paths, query strings and fragments are rejected;
- duplicate origins are rejected after normalization;
- production origins must use HTTPS;
- regression tests cover safe and rejected configurations.

### SR-02 — Browser roles retain broad grants on API-owned public tables — open production-readiness item

**Risk:** medium defense-in-depth risk; no current direct row exposure was observed.

Hosted inspection found RLS enabled with no policies on API-owned public tables such as `jobs`, `candidates`, `applications`, `posts`, `publications`, `social_accounts`, and related tables. RLS-with-no-policy currently denies browser row access, but `anon` and `authenticated` still hold broad table privileges on ten of these domain tables. `social_credentials` is already correctly revoked from browser roles.

**Required before production readiness:** revoke `anon`/`authenticated` privileges from API-owned domain tables that are not intentionally exposed through Supabase Data API, then rerun the Supabase security advisor and direct privilege checks. Do not replace this with permissive RLS policies merely to silence the advisor.

No hosted DDL is changed by this review because production database/infrastructure mutation requires separate approval.

### SR-03 — Private bucket lacks authoritative file-size/MIME limits — open production-readiness item

**Risk:** medium resource-consumption / unsafe-upload risk.

The hosted `recruitops-private` bucket is private and RLS-protected, but its bucket-level `file_size_limit` and `allowed_mime_types` are unset. RecruitOps currently enforces the CV policy in browser code (`PDF/DOC/DOCX`, max 10 MiB), which improves UX but is not an authoritative boundary because an authenticated client can call Supabase Storage directly.

**Required before production readiness:** configure authoritative bucket/server-side upload limits that are compatible with every private-file purpose, or move upload authorization behind a server-issued upload boundary that validates purpose, MIME and maximum size. Reverify direct Storage API behavior after the change.

### SR-04 — No global API request-rate limiter — open production-readiness item

**Risk:** medium API resource-consumption risk.

The API bounds individual inputs, provider timeouts, queue concurrency and retries, but there is no global/per-principal request-rate limiter at the HTTP boundary. In particular, unauthenticated token-verification attempts can still cause upstream Supabase Auth traffic.

**Required before production readiness:** choose an enforcement point that works correctly behind Render/proxies and across multiple API instances. Prefer a shared limiter for sensitive/authenticated business flows rather than an in-memory limiter that silently becomes per-instance. Add 429 behavior, retry headers where appropriate, and abuse-regression tests.

### SR-05 — Static frontend has no Content Security Policy — open production-readiness item

**Risk:** medium browser hardening gap.

The current Render static service sends baseline anti-sniffing/referrer/framing headers, but no CSP. A CSP must be derived from the real production origins needed by Next static assets, Supabase Auth/Storage, RecruitOps API, and optional Sentry ingestion; it should not be guessed from development URLs.

**Required before production readiness:** deploy and validate an explicit CSP (prefer report-only validation first if operationally appropriate), then confirm authentication, storage, API calls and optional monitoring still work without widening directives unnecessarily.

### SR-06 — Candidate retention/deletion policy is not finalized — open stakeholder/privacy item

**Risk:** privacy/governance risk rather than a code exploit.

The repository security baseline already records candidate PII as sensitive and states that retention/deletion must be finalized before production use. That policy is still unresolved and must define retention triggers, authorized deletion, CV/object cleanup, audit handling and any legally required exceptions.

## OWASP API risk coverage summary

- **API1 / API5 — object/function authorization:** guarded controllers, role regression matrix and Storage ownership policies are present; team-wide object visibility remains the explicit application model where documented.
- **API2 — authentication:** bearer-token validation fails closed and provider errors are separated from invalid-token responses.
- **API3 — property authorization:** request schemas are strict on sensitive mutation paths and public contracts exclude OAuth credential payloads.
- **API4 / API6 — resource consumption / sensitive flows:** queue/provider limits exist, but HTTP rate limiting and authoritative Storage upload limits remain production-readiness findings SR-03/SR-04.
- **API7 — SSRF:** implemented provider clients target configured provider endpoints; provider-facing private-media URLs are generated server-side from stored object keys rather than arbitrary operator URLs.
- **API8 — security misconfiguration:** CORS is hardened in this review; CSP and hosted Data API grants remain explicit follow-ups.
- **API9 — inventory management:** API/architecture docs and Master Plan track implemented provider boundaries; unfinished providers remain marked incomplete rather than presented as production-ready.
- **API10 — unsafe API consumption:** provider responses are schema-validated/sanitized at integration boundaries and network calls use bounded timeouts where implemented.

## Completion boundary

This security review is considered complete when the SR-01 code fix passes the full repository quality/security gates and this review is merged. Completion of the review does **not** mean production readiness. SR-02 through SR-06 are intentionally carried into the production-readiness review because they require hosted configuration, shared rate-limit architecture, production-origin policy, or stakeholder decisions that are outside this review's safe autonomous mutation boundary.
