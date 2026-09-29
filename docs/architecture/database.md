# Database Architecture

PostgreSQL is the durable source of truth for RecruitOps domain state.

## Implemented domain models

The canonical Prisma schema currently defines:

- `Job`
- `Post`
- `PostVariant`
- `MediaAsset`
- `SocialAccount`
- `SocialCredential`
- `Destination`
- `Publication`
- `Candidate`
- `Application`
- `CandidateDocument`

Planned domains that are not yet represented as persisted models include:

- `CommissionTransaction`
- `ReconciliationBatch`
- additional audit persistence extensions as required by later phases.

## Design rules

- Public/domain identifiers use UUIDs where API-facing opaque identifiers are required.
- Foreign-key access paths are indexed explicitly.
- Event timestamps use PostgreSQL `TIMESTAMPTZ` through Prisma native types.
- Salary bounds use integer minor units (`BigInt`) rather than floating point.
- `PostVariant` enforces one variant per `(postId, platform)`.
- Semi-structured platform metadata uses PostgreSQL JSONB through Prisma `Json`.
- Job deletion cascades to canonical posts; post deletion cascades to variants. Application services must still apply authorization and lifecycle rules before destructive actions are exposed.
- OAuth provider token payloads are never modeled as plaintext columns. `SocialCredential` stores an AES-256-GCM envelope (`keyId`, algorithm, IV, authentication tag and ciphertext), while `SocialAccount.credentialRef` is a unique optional relation to that envelope.
- The `social_credentials` hosted table is API-owned with RLS enabled and no browser-facing policy; the migration additionally revokes `anon` and `authenticated` table privileges.

## Performance and indexes

The current Prisma schema indexes implemented Job/Content, publication/scheduling/retry, social-account lifecycle, candidate deduplication and application-pipeline access paths.

The 2026-09-30 hosted performance review found no evidence-based index migration to apply: business tables still have no representative production rows, and Supabase Performance Advisor reports only informational unused-index findings. Existing intentional indexes are therefore preserved until realistic workload/query statistics justify a change.

See [`database-performance.md`](./database-performance.md) for the hosted evidence, index rationale, revisit thresholds, and production-readiness review method.

## Migration ownership

`packages/database/prisma/schema.prisma` remains the canonical application data model. Hosted production DDL is committed under `infra/supabase/migrations/` and tracked/executed by Supabase according to ADR 0006. RecruitOps does not introduce a parallel hosted `prisma migrate deploy` history.

The OAuth credential-storage schema change is represented by `infra/supabase/migrations/20260928_secure_social_credentials.sql`. Committing the migration does not imply it has been applied to the hosted production project.

## Persistent-source rule

PostgreSQL remains the durable source of truth. The hosted API must not introduce an in-memory fallback merely to avoid missing database credentials; persistence endpoints are enabled only after the real database connection is configured.

See:
- `../product/job-content-domain.md`
- `../product/candidate-application-domain.md`
- `social-domain.md`
- `database-performance.md`
- `../diagrams/database-erd.md`
- `../diagrams/social-domain-erd.md`
