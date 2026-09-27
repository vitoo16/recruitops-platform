# Queue Package

`@recruitops/queue` owns BullMQ-specific publication scheduling and worker-runtime boundaries.

## Responsibilities

- one queue per social platform so one provider's throttling does not block all others;
- delayed jobs for future publication times;
- deterministic BullMQ-safe job IDs (`publication-<uuid>`);
- bounded transport retries with exponential backoff;
- a conservative internal worker limiter that can be overridden by a provider adapter after its current official limits are verified;
- dependency-injected queue factories so scheduling behavior is unit-testable without a live Redis instance.

The database `Publication.idempotencyKey` remains the authoritative application-level idempotency boundary. BullMQ job IDs provide an additional duplicate-suppression layer only while the matching queue job is retained.

The BullMQ dependency is pinned through the repository `pnpm-lock.yaml`; the generic Lockfile Sync workflow keeps future workspace dependency changes reproducible instead of targeting a one-off feature branch.

The package deliberately does not implement any social provider request. Provider adapters remain separate work under Phase 5.
