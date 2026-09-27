# Database Package

`@recruitops/database` owns the Prisma data model, generated Prisma client, database access helpers and DB-specific tests.

## Schema ownership

`prisma/schema.prisma` is the canonical application data model. RecruitOps uses Prisma to validate the model and to generate PostgreSQL migration SQL with `prisma migrate diff`.

Hosted Supabase DDL is executed and tracked by the Supabase migration system. Production migration SQL therefore lives in `infra/supabase/migrations/` rather than `prisma/migrations/`. This avoids maintaining two independent production migration histories (`supabase_migrations` and `_prisma_migrations`).

Do not run `prisma migrate deploy` against hosted RecruitOps environments unless the migration ownership ADR is deliberately replaced.

## Access boundary

Application tables are API-owned. Browser clients do not query domain tables directly through the Supabase Data API. NestJS accesses PostgreSQL through the server-only database connection and applies authentication, RBAC and audit controls.

Supabase Auth and the private Storage bucket remain intentional browser-facing Supabase capabilities.
