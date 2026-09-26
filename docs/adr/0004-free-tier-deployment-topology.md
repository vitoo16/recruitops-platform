# ADR-0004: Free-tier deployment topology

## Status
Accepted for MVP / hobby validation

## Context
RecruitOps needs a zero-cost starting point for frontend, API, PostgreSQL, object storage and Redis-compatible queue infrastructure. The system must remain portable to paid/always-on infrastructure later.

## Decision
Use:

- Render Static Site for the exported Next.js frontend.
- Render Free Web Service for the NestJS API.
- Supabase Free project for PostgreSQL and private object storage.
- Upstash Redis Free for Redis/BullMQ-compatible connectivity.
- Upstash QStash as an optional external scheduled HTTP trigger for wake-up/scheduling bridges while the free Render API can sleep.

The worker application remains defined in the monorepo but is not deployed as an always-on free Render worker because Render background workers are not part of the free service set.

## Consequences

### Positive
- No infrastructure cost for initial development/hobby validation within provider free quotas.
- Frontend is CDN-hosted and does not sleep.
- PostgreSQL/storage remain separate from API compute.
- Redis can later be reused by dedicated paid workers.
- Deployment configuration remains infrastructure-as-code through `render.yaml` and documented environment variables.

### Trade-offs
- Render Free Web Services can spin down after inactivity, so the first request after idle can experience a cold start.
- Free-tier quotas are not suitable for production SLAs.
- Long-running BullMQ processing should move to an always-on worker when scheduled publishing becomes business-critical.
- Provider pricing/quotas can change and must be rechecked before production use.

## Migration path
When reliability requirements increase:
1. keep Supabase/Postgres schema portable;
2. upgrade API to always-on compute;
3. deploy `apps/worker` independently;
4. keep Redis queue contracts unchanged;
5. move scheduled work from wake-up bridges to dedicated BullMQ workers.
