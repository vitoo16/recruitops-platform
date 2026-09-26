# Database Architecture

PostgreSQL is the durable source of truth.

Initial core entities:
- User
- Job
- Post
- PostVariant
- Media
- SocialAccount
- Destination
- Publication
- Candidate
- Application
- CommissionTransaction
- ReconciliationBatch
- AuditLog

Rules:
- monetary values use NUMERIC/DECIMAL or integer minor units;
- timestamps are timezone-aware;
- OAuth credentials are not stored plaintext;
- PII access is authorization-controlled;
- migrations require rollback/compatibility review;
- indexes must follow actual query patterns.

See `../diagrams/database-erd.md`.
