# ADR-0005: Use Supabase Auth for RecruitOps identity

## Status
Accepted

## Context

RecruitOps needs a zero-cost identity provider for the web client and a trustworthy identity boundary for the NestJS API. The frontend is currently deployed as a static Next.js export, so authentication cannot depend on Next.js server actions or server-side cookies.

The project already uses a Supabase Free project for PostgreSQL and private storage.

## Decision

Use Supabase Auth as the identity provider.

- The static web client uses `@supabase/supabase-js` with the project URL and **publishable** key.
- The browser SDK owns session persistence and token refresh. RecruitOps code does not copy refresh/access tokens into custom storage.
- Password sign-in is supported for provisioned accounts. Public self-signup is intentionally not exposed.
- API calls send the Supabase access token as `Authorization: Bearer <token>`.
- The NestJS API validates the access token against Supabase Auth's `/auth/v1/user` endpoint using the publishable key.
- The API never trusts `getSession()` or browser-supplied user objects for authorization.
- Application RBAC uses the admin-controlled `app_metadata.recruitops_role` value with roles `OWNER`, `ADMIN`, `RECRUITER`, and `VIEWER`. Missing/unknown roles fail down to `VIEWER`.

## Why server validation instead of the project JWT shared secret?

Supabase's current JWT guidance recommends validating HS256 user access tokens through the Auth server rather than distributing the shared JWT secret. If/when the project uses asymmetric signing keys, the API may migrate to local JWKS verification to reduce network latency without changing the bearer-token contract.

## Security properties

- The publishable key is suitable for client applications; no secret/service-role key is shipped to the browser.
- Authorization roles come from `app_metadata`, not user-editable metadata.
- Backend role guards are explicit and deny when an allowed role is not present.
- Auth provider requests have a bounded timeout.
- Raw access/refresh tokens must never be logged.
- Production CORS is restricted to the deployed frontend origin.

## Consequences

### Positive
- Fits the existing free-tier topology.
- No password storage in RecruitOps.
- Supabase owns session refresh/revocation semantics.
- Backend remains the authorization enforcement point for RecruitOps APIs.

### Trade-offs
- Current backend validation requires a network request to Supabase Auth per protected request while shared-secret signing is in use.
- Free-tier provider availability affects sign-in/protected requests.
- Role changes in `app_metadata` require privileged administration and existing access tokens may need refresh before client-visible metadata changes; the backend user lookup remains authoritative for the current user record.

## Future evolution

When asymmetric signing is enabled, switch backend verification to the project's JWKS endpoint and validate signature, issuer, audience and expiration according to Supabase guidance. Keep role authorization and the API bearer contract unchanged.

## Official references

- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0#mapping-user-metadata-and-custom-claims
