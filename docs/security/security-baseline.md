# Security Baseline

## Sensitive assets

- OAuth access/refresh credentials
- candidate CVs
- candidate full name/email/phone
- normalized candidate contact values and duplicate-match signals
- application/source history
- audit data

## Mandatory controls

- least privilege
- encryption at rest for sensitive credentials
- private object storage
- short-lived/signed file access where applicable
- secrets outside source control
- log redaction
- webhook verification/replay controls
- RBAC
- audit records for sensitive state changes
- validated file uploads
- dependency/security scanning in CI when implementation begins

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

Security-sensitive implementation must load the OWASP security skill.
