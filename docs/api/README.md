# API Documentation

NestJS under `apps/api` is the authoritative HTTP boundary for RecruitOps domain operations. Browser clients may use Supabase Auth for identity, but they must not bypass the API to mutate domain tables.

## Implemented domain APIs

- [`jobs.md`](./jobs.md) — authenticated Job Hub list, detail, create, and partial update endpoints.

## Cross-cutting behavior

- Global prefix: `/api`.
- Authentication: Supabase bearer access token verified by the API.
- Authorization: RBAC with `OWNER`, `ADMIN`, `RECRUITER`, and `VIEWER`.
- Validation: shared Zod contracts where available.
- Errors: stable application error codes where implemented; callers must not depend on provider-specific SDK errors.
- Persistence: server-owned Prisma/PostgreSQL boundary.

Candidate, content, destination, publication, and commission HTTP APIs must be documented here when those public application-service boundaries are implemented. Their existing domain models alone do not imply an HTTP API.
