# Security Baseline

## Sensitive assets

- OAuth access/refresh credentials
- candidate CVs
- candidate email/phone
- application history
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

Security-sensitive implementation must load the OWASP security skill.
