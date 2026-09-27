# Job Hub UI

The Job Hub UI consumes the authenticated NestJS Job API. It never reads or writes the `jobs` PostgreSQL table through the Supabase Data API.

## Authentication and authorization

The browser obtains the current Supabase Auth session and forwards the short-lived access token as a bearer token to `NEXT_PUBLIC_API_URL`.

The UI verifies `/auth/me` to determine presentation permissions:

- `OWNER`, `ADMIN`, `RECRUITER`: list/search, create jobs and change lifecycle status.
- `VIEWER`: list/search only.

The NestJS API remains the authoritative authorization boundary; hiding mutation controls in the browser is only a UX measure.

## Current job operations

- authenticated list with bounded API pagination,
- search by title/company/location,
- create a job with shared contract validation,
- transition between the existing `DRAFT`, `ACTIVE`, `PAUSED` and `CLOSED` lifecycle states,
- bilingual VI/EN UI strings,
- loading, empty, configuration, authorization and API-failure states.

Hard deletion is intentionally absent. Job closure uses the existing lifecycle state and preserves references from applications.
