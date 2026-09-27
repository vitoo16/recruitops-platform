# Authentication Security Baseline

RecruitOps uses Supabase Auth for identity and session issuance. Authorization remains enforced by the NestJS API.

## Browser rules

- Only the Supabase project URL and publishable key may be exposed through `NEXT_PUBLIC_*` variables.
- Never expose Supabase secret/service-role keys to the browser.
- Do not persist custom application access tokens outside the Supabase client session mechanism.
- Do not log access tokens, refresh tokens, password values, or full authentication error objects containing sensitive request context.

## API rules

- Protected routes require `Authorization: Bearer <access-token>`.
- The API validates the access token with Supabase Auth before trusting the user identity.
- Missing, malformed, expired, revoked, or otherwise invalid credentials return HTTP 401.
- Authentication alone never grants administrative privileges; RBAC is evaluated separately.
- Request logs must never include the `Authorization` header.

## Identity model

The stable external identity key is Supabase `user.id` / JWT `sub`.

RecruitOps application roles will be mapped separately in the application database. Browser-editable user metadata is not an authorization source.

## Free-tier operational note

Hosted Supabase email/password signup may require email confirmation, depending on project Auth settings. The hosted default email service is suitable for development/testing only and is subject to strict rate limits. Production email delivery will require an approved SMTP provider.
