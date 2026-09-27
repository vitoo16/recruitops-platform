# Database Architecture

PostgreSQL is the durable source of truth.

## Implemented domain models

The schema currently defines:
- `Job`
- `Post`
- `PostVariant`

Planned later domains remain documented but are not represented as implemented tables until their phase begins:
- User/auth persistence additions as required by the selected auth architecture;
- Media;
- SocialAccount;
- Destination;
- Publication;
- Candidate;
- Application;
- CommissionTransaction;
- ReconciliationBatch;
- Audit persistence extensions.

## Job/content design rules

- Public/domain identifiers use UUIDs so API-facing identifiers are opaque and can be created independently.
- Foreign-key access paths are indexed explicitly.
- Event timestamps use PostgreSQL `TIMESTAMPTZ` through Prisma native types.
- Salary bounds use integer minor units (`BigInt`) rather than floating point.
- `PostVariant` enforces one variant per `(postId, platform)`.
- Semi-structured platform metadata uses PostgreSQL JSONB through Prisma `Json`.
- Job deletion cascades to canonical posts; post deletion cascades to variants. Application services must still apply authorization and lifecycle rules before destructive actions are exposed.

## Persistent-source rule

PostgreSQL remains the durable source of truth. The hosted API must not introduce an in-memory fallback for Jobs or Posts merely to avoid missing database credentials; persistence endpoints are enabled only after the real database connection is configured.

See:
- `../product/job-content-domain.md`
- `../diagrams/job-content-erd.md`
- `../diagrams/content-draft-state.md`
