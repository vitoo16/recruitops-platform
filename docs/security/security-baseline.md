# Security Baseline

## Sensitive assets

- OAuth access/refresh credentials
- OAuth credential-encryption keys
- candidate CVs
- candidate full name/email/phone
- normalized candidate contact values and duplicate-match signals
- application/source history
- audit data

## Mandatory controls

- least privilege
- authenticated encryption at rest for OAuth provider credentials
- private object storage
- short-lived/signed file access where applicable
- secrets outside source control
- log redaction
- webhook verification/replay controls
- RBAC
- audit records for sensitive state changes
- validated file uploads
- dependency/security scanning in CI when implementation begins

## OAuth credential handling

- Provider token payloads must cross only server-side boundaries.
- Public/shared contracts must not contain access tokens, refresh tokens, encrypted token envelopes or credential references.
- Persist OAuth credentials only through the server-side credential store, which encrypts before writing to PostgreSQL.
- AES-256-GCM integrity failures, unknown keys and malformed envelopes fail closed with sanitized error codes.
- A fresh IV is generated for every encryption operation.
- The runtime keyring separates the active write key from retained read keys so rotation can be performed without making existing credentials unreadable.
- `AUTH_SECRET`, OAuth client secrets and credential-encryption keys are independent secrets and must not be reused across purposes.
- `social_credentials` is API-owned: RLS is enabled and browser roles are explicitly revoked in the hosted migration.
- No provider OAuth connection flow is considered complete until its current official scopes/requirements and token lifecycle are verified separately.

## Candidate PII handling

- Candidate contact values and normalized contact values are PII.
- Do not write raw candidate email, phone, CV contents, or normalized duplicate keys into ordinary application logs.
- Do not use PII as correlation IDs, metric labels, queue job names, or idempotency keys.
- Authorization must scope Candidate/Application reads and writes before public API endpoints are enabled.
- Duplicate matching returns internal candidate identifiers/signals; it must not expose another candidate's contact data to an unauthorized caller.
- Retention/deletion policy must be finalized before production use of candidate records.

## Authorization regression matrix

Automated tests lock the current PII authorization policy so route decorators cannot silently broaden access:

- Candidate/Application read routes: `OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`.
- Candidate/Application mutation routes: `OWNER`, `ADMIN`, `RECRUITER` only.
- Duplicate-signal lookup: `OWNER`, `ADMIN`, `RECRUITER` only.
- Candidate CV metadata registration/listing: `OWNER`, `ADMIN`, `RECRUITER` only; `VIEWER` excluded.
- Private object signed URLs: recruiter own-prefix only; `OWNER`/`ADMIN` cross-prefix using trusted `app_metadata.recruitops_role`; unknown roles fail closed.

These application tests complement, but do not replace, Supabase Storage RLS. Hosted RLS policy verification remains part of environment/security readiness checks.

Security-sensitive implementation must load the OWASP security skill when it is available. If it is unavailable in the execution environment, the agent must state that and follow repository security rules plus current official security documentation instead of pretending the skill was loaded.
