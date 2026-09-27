# Job API

The Job API is the server-owned persistence boundary for recruitment jobs. Browser clients authenticate with Supabase Auth, send the bearer token to NestJS, and never query the `jobs` table directly through the Supabase Data API.

## Endpoints

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/jobs` | OWNER, ADMIN, RECRUITER, VIEWER | List jobs with bounded pagination/filtering. |
| `GET` | `/api/jobs/:id` | OWNER, ADMIN, RECRUITER, VIEWER | Fetch one job. |
| `POST` | `/api/jobs` | OWNER, ADMIN, RECRUITER | Create a job. |
| `PATCH` | `/api/jobs/:id` | OWNER, ADMIN, RECRUITER | Partially update a job, including lifecycle status. |

There is intentionally no hard-delete endpoint in this slice. The domain already has the `CLOSED` lifecycle state and applications hold restrictive foreign-key references to jobs. Any future destructive retention operation requires an explicit product/data-retention decision rather than being inferred here.

## Validation

Request bodies and query strings are parsed with shared Zod contracts from `@recruitops/contracts` before persistence. Invalid requests return HTTP 400 with `code: INVALID_REQUEST` and field-level issues.

Salary values are integer minor units and must remain within JavaScript's safe-integer range. PostgreSQL persists them as `BIGINT`; the API checks the stored value before converting it to JSON numbers, preventing silent precision loss.

List requests support `status`, `employmentType`, `search`, `page`, and `pageSize`. `pageSize` is capped at 100.

## Database availability

The Prisma client is created lazily from the server-only `DATABASE_URL`. If the API is started without a database connection, database-backed endpoints return a service-unavailable error instead of embedding credentials in source control or silently switching to an in-memory store.
