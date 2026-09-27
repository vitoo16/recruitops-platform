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

Security-sensitive implementation must load the OWASP security skill.
