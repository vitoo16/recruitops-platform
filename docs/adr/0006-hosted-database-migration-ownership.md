# ADR 0006 — Hosted database migration ownership

## Status

Accepted.

## Context

RecruitOps uses Prisma as its TypeScript ORM/data-model tool and Supabase as the hosted PostgreSQL provider. Both Prisma Migrate and Supabase maintain their own migration history. Applying the same production schema through Supabase while also treating `prisma/migrations` as deployable history would create two independent sources of migration truth.

The web application also uses Supabase Auth and private Storage directly, while business/domain records are intended to pass through the NestJS API so RBAC and audit controls remain centralized.

## Decision

- `packages/database/prisma/schema.prisma` is the canonical application data model.
- Prisma validates the schema, generates the client and may generate PostgreSQL SQL with `prisma migrate diff`.
- Hosted production DDL is committed under `infra/supabase/migrations/` and executed/tracked by Supabase migrations.
- RecruitOps does not run `prisma migrate deploy` against hosted environments under this ADR.
- Domain tables in `public` are API-owned and have RLS enabled without browser-facing policies.
- Browser clients may use Supabase Auth and approved private Storage flows, but must not query domain tables directly.
- NestJS uses a server-only database connection and remains responsible for authentication, RBAC, validation and audit logging around domain data.

## Consequences

There is one hosted migration history instead of parallel Prisma/Supabase histories. Changes to Prisma models must be accompanied by reviewed Supabase migration SQL generated or reconciled against the Prisma schema. Any future decision to move production migration execution to Prisma requires a new ADR and an explicit migration-history baseline plan.
