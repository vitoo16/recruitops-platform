# Publication Operations Runbook

## Purpose

Use this runbook when RecruitOps publishing is delayed, repeatedly retrying, failing, or left in an uncertain external-provider state. It covers the current Phase 5 publication path: Publish Now, scheduled dispatch, BullMQ retries, provider failures, credential expiry, and guarded manual retry.

This runbook does not authorize bypassing provider permissions, replaying ambiguous requests, exposing credentials, or mutating production infrastructure without the normal deployment/change-control process.

## Sources of truth

Use these in this order:

1. the durable `Publication` row and its persisted state/timestamps;
2. the BullMQ job whose job ID is the same Publication UUID;
3. worker/API structured logs correlated by Publication/correlation identifiers;
4. integration-health/account lifecycle state;
5. provider-side evidence, when access is available.

Do not treat a browser success message or queue acceptance as provider publication success.

## Fast triage

Classify the incident before taking action.

| Symptom | Likely boundary | First safe action |
| --- | --- | --- |
| `SCHEDULED` after `scheduledAt` | queue/worker availability or delayed-job dispatch | inspect worker availability and BullMQ job state |
| `RETRY_WAITING` | automatic retry/backoff | inspect `nextRetryAt`, retry count, and normalized failure |
| `FAILED` | terminal or exhausted publication attempt | inspect normalized error and retry eligibility |
| `PUBLISHING` for unexpectedly long time | possible interrupted/ambiguous provider call | do **not** replay; verify provider side first |
| `PROCESSING` for unexpectedly long time | provider accepted asynchronous work but completion reconciliation is pending | verify provider-side processing state; do not create a duplicate Publication |
| `PUBLICATION_PUBLISHER_UNAVAILABLE` | provider runtime intentionally not registered/activated | verify provider activation/configuration boundary; do not force replay |
| account `EXPIRED`, `REVOKED`, or `ERROR` | credential lifecycle | reconnect/refresh through supported account flow before retrying eligible failures |
| repeated HTTP 429 / provider 5xx | provider rate limit/outage | allow bounded automatic backoff; reduce manual intervention |

## Procedure: overdue scheduled publication

1. Confirm the persisted Publication is still `SCHEDULED` and `scheduledAt` is in the past.
2. Confirm the worker process that consumes the publication queue is actually deployed/running for the environment under investigation.
3. Inspect the BullMQ job by the Publication UUID.
4. If the job is still delayed, verify the stored delay/run time and Redis/BullMQ clock assumptions before changing anything.
5. If the job is waiting but not consumed, investigate worker connectivity, queue name/configuration, concurrency, limiter, and Redis availability.
6. If the job is active, inspect worker logs and the durable Publication row before intervening.
7. Do not create a second Publication merely because the calendar entry is overdue.
8. Once recovered, confirm the same Publication UUID progresses through the normal state machine.

## Procedure: automatic retry backlog

1. Filter affected Publications in `RETRY_WAITING`.
2. Compare `retryCount` and `nextRetryAt` with the configured retry policy.
3. Group normalized failures by code/provider to distinguish a single bad post from a provider-wide incident.
4. For HTTP 429 or provider/server 5xx patterns, prefer the existing bounded BullMQ backoff. Avoid manual retry storms.
5. Confirm queue backlog, worker concurrency, and limiter settings are consistent with the environment configuration.
6. If a provider outage is confirmed, leave retrying jobs bounded by their configured policy and prevent operators from repeatedly manufacturing new publication intents for the same content/destination.
7. After provider recovery, verify retrying Publications advance without duplicate provider posts.

## Procedure: terminal `FAILED` publication

1. Read the persisted normalized `lastErrorCode` / `lastErrorMessage` and current `updatedAt`.
2. Confirm the Publication is actually `FAILED`; do not manually retry `RETRY_WAITING`, `PUBLISHING`, `PROCESSING`, `PUBLISHED`, `SCHEDULED`, or `CANCELLED` rows.
3. Check whether the API declares the failure retryable by the manual-retry workflow.
4. If eligible, use the application retry action/API so optimistic concurrency and BullMQ reconciliation are preserved.
5. The retry path must keep the same Publication UUID:
   - retained failed BullMQ job: retry that job and reset attempts;
   - retained job missing: enqueue the same Publication UUID;
   - job already waiting/delayed/prioritized/active/waiting on children: accept the existing queued execution and do not add another job.
6. Reload persisted status after the retry request settles.
7. If the queue action itself is uncertain, inspect the durable row and BullMQ job before trying again.

## Procedure: ambiguous external outcome

Examples include a worker/process interruption after a provider may have accepted the publish request but before RecruitOps persisted the response.

1. Treat persisted `PUBLISHING` with evidence of an interrupted provider call as potentially externally accepted.
2. Do **not** use manual retry to replay `PUBLICATION_AMBIGUOUS_OUTCOME` or `PUBLICATION_IDEMPOTENCY_KEY_MISMATCH`.
3. Verify provider-side state using the provider's supported management/API surface and the persisted provider identifiers if available.
4. If the provider confirms the content exists, reconcile the application state through a dedicated supported reconciliation path when available; do not manufacture a second post.
5. If the provider confirms it does not exist, record the evidence and use an approved recovery path. Until a reconciliation implementation exists, escalate rather than bypass the fail-closed guard.
6. Preserve logs/correlation identifiers needed for incident review.

## Procedure: expired or revoked credential

1. Confirm account lifecycle state and integration-health output.
2. Never expose/decrypt provider credentials in the browser or logs while troubleshooting.
3. For a supported refresh path, use the authenticated RecruitOps refresh flow only while the account is still eligible for refresh.
4. If the account is `EXPIRED`, `REVOKED`, `ERROR`, has missing/corrupt credentials, or fails provider identity verification, require reconnect through the supported OAuth/account-promotion flow.
5. After account recovery, verify the Destination still references the intended connected SocialAccount.
6. Retry only Publications that are persistently `FAILED` and eligible for manual retry. Do not replay ambiguous outcomes.

## Procedure: provider outage or sustained rate limit

1. Confirm the problem is provider-wide using normalized errors across multiple Publications/accounts and, where available, official provider status information.
2. Do not disable idempotency, increase retries without review, or bypass rate-limit boundaries.
3. Allow bounded automatic retry/backoff to absorb transient 429/5xx responses.
4. Avoid repeated Publish Now clicks/new UUIDs for the same intended external post while the provider is degraded.
5. If the incident exceeds the configured retry window, let Publications become `FAILED` and recover them deliberately after the provider stabilizes.
6. After recovery, sample affected Publications for duplicate-free completion and confirm queue depth returns to normal.

## Worker restart safety

Before restarting a worker:

1. capture current queue/backlog and affected Publication IDs;
2. confirm no infrastructure/configuration change is being smuggled into an operational restart;
3. use graceful shutdown so BullMQ stops accepting work before Prisma disconnects;
4. after restart, verify queue connectivity, enabled publisher registry, database connectivity, and resumed consumption;
5. inspect long-lived `PUBLISHING` rows separately because they may represent ambiguous external outcomes and must not be blindly replayed.

## Data and secret safety

Never paste or persist into tickets/chat/runbooks:

- OAuth access/refresh tokens;
- encryption keys/keyrings;
- Redis/PostgreSQL connection strings containing credentials;
- Supabase secret keys;
- private storage signed URLs/query tokens;
- raw provider response bodies that may contain sensitive data.

Use normalized error codes/messages and opaque record IDs for incident coordination.

## Escalation conditions

Escalate instead of forcing recovery when any of these is true:

- provider acceptance cannot be determined for an ambiguous outcome;
- the same Publication appears to have produced duplicate external posts;
- persisted Publication and BullMQ identity no longer agree;
- credential/account identity does not match the Destination;
- repeated optimistic concurrency failures indicate another actor is changing state;
- a fix would require changing production secrets, provider permissions, database schema, queue retention, retry policy, or provider activation flags;
- a platform-specific reconciliation feature is required but not implemented.

## Recovery verification

A publication incident is operationally recovered only when all applicable checks are true:

- affected durable Publication rows are in expected states;
- no unsafe manual replay was used for ambiguous outcomes;
- BullMQ contains no unexpected duplicate jobs for the same Publication UUID;
- worker consumption/backlog is healthy;
- account/integration health is consistent with the intended provider runtime;
- sampled provider-side posts show no duplicate caused by recovery;
- normalized errors and correlation data are sufficient for follow-up analysis.

## Related documentation

- `docs/architecture/publication-domain.md`
- `docs/architecture/publication-execution.md`
- `docs/architecture/publication-scheduling.md`
- `docs/diagrams/publication-state.md`
- `docs/diagrams/publication-operations-sequence.md`
