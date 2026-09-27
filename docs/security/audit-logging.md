# Security Audit Logging Baseline

## Purpose

RecruitOps records security-relevant application events separately from ordinary HTTP request logs. The initial baseline covers authentication and authorization outcomes and is designed to extend to candidate/CV access, commission changes, social-account changes and other sensitive domain operations.

## Current event types

- `AUTHENTICATION_SUCCESS`
- `AUTHENTICATION_FAILURE`
- `AUTHORIZATION_DENIED`

## Required event fields

Where available, audit entries include:

- UTC timestamp (`occurredAt`)
- event type and outcome
- request/correlation ID
- stable actor ID
- application role
- HTTP method and route
- bounded machine-readable reason code

## Sensitive-data rules

Audit logs must never contain:

- passwords
- OAuth access/refresh tokens
- Supabase bearer tokens
- API keys or service-role keys
- CV file contents
- raw authorization headers
- unnecessary candidate PII

Free-form string fields are normalized, control characters are removed and values are length-bounded before logging to reduce log-injection and resource-abuse risks.

## Current persistence model

The baseline writes structured JSON events through Nest's application logger to stdout so Render can collect them with the API service logs. This is an operational/security logging baseline, not yet the durable business audit trail.

A future database-backed `AuditLog` domain will persist sensitive business mutations once the application database connection is enabled. That durable trail must be authorization-controlled and protected from ordinary user mutation/deletion.

## Correlation

The request middleware generates or accepts a bounded `x-request-id`, stores it on the request context and returns it in the response. Authentication and authorization audit events reuse the same ID so request logs and security events can be correlated without logging credentials.

## Security headers

NestJS framework security headers are enabled globally at bootstrap before route handling. This uses Nest's built-in `useSecurityHeaders()` support and avoids an extra Helmet runtime dependency.

## Testing requirements

Security regression tests must verify at minimum:

- missing bearer credentials are denied and audited;
- invalid access tokens are denied without the token appearing in the audit event;
- valid authenticated principals are attached to request context;
- role violations are denied and audited;
- routes without role metadata are not incorrectly denied.
