# Runbooks

Operational runbooks are added alongside the features they cover.

## Available

- [`publication-operations.md`](./publication-operations.md) — publication queue/worker backlog, scheduled dispatch, automatic/manual retry, ambiguous outcomes, provider outages, and credential lifecycle recovery.
- [`backup-restore.md`](./backup-restore.md) — Supabase database + private Storage backup sets, restore-to-new-project procedure, verification, rollback, recovery drills, and paid-tier upgrade path.

## Still required by later phases

- deployment
- database migration
- n8n failure recovery
- incident response

Provider-specific procedures should extend the publication runbook only when real production configuration/E2E makes those steps verifiable. Do not document speculative provider recovery commands.
