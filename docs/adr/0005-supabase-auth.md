# ADR-0005: Use Supabase Auth with API-side token verification

## Status
Accepted

## Context
RecruitOps needs a zero-cost authentication foundation that works with the existing Supabase Free project, a statically exported Next.js frontend, and a separately deployed NestJS API.

The frontend must not own authorization decisions. The API must be able to authenticate bearer tokens before domain-level RBAC is applied.

## Decision
Use Supabase Auth for identity and session issuance.

- The browser uses `@supabase/supabase-js` with the public project URL and publishable key.
- Email/password authentication is the initial supported flow.
- The browser sends the Supabase access token to RecruitOps API requests through the `Authorization: Bearer <token>` header.
- NestJS validates each protected request by calling Supabase Auth `getUser(jwt)` through a server-side Supabase client configured with session persistence disabled.
- The publishable key is allowed in frontend build-time configuration; service-role/secret keys are never exposed to the browser.
- Application RBAC remains a RecruitOps concern and will be implemented separately from identity verification.

## Why API-side `getUser(jwt)` validation
Supabase documents `getUser(jwt)` as a network-backed validation call whose returned user can be trusted for authorization decisions. This approach works regardless of whether the project is currently using asymmetric signing keys or a legacy shared signing secret.

A future optimization may switch to locally cached `getClaims(jwt)`/JWKS verification after confirming the project's signing-key configuration and adding appropriate negative-path tests.

## Session model
- Supabase manages browser session persistence and refresh-token rotation.
- RecruitOps does not mint a second application access token.
- Access tokens are treated as short-lived bearer credentials.
- Authorization state such as application roles is not trusted from arbitrary browser metadata.

## Consequences

### Positive
- No custom password storage or password hashing in RecruitOps.
- Reuses the existing free Supabase project.
- Works with a static frontend and independent API.
- API remains the authorization boundary.

### Trade-offs
- Protected API requests perform an Auth-server validation request in the initial implementation.
- Render Free and Supabase network latency can affect cold-path requests.
- RBAC still requires a durable application-side role mapping.

## Security requirements
- Never expose a Supabase secret/service-role key in `NEXT_PUBLIC_*` variables.
- Never log bearer access tokens or refresh tokens.
- Return generic unauthorized responses.
- Keep CORS restricted to approved frontend origins.
- Apply RBAC in the API even when the user is authenticated.
