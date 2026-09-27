# Security Policy

RecruitOps will process OAuth credentials and candidate personal data.

## Baseline

- Never commit secrets or tokens.
- Encrypt sensitive credentials at rest.
- Use least-privilege OAuth scopes.
- Keep CV files private and serve them with authorized/signed access.
- Verify supported webhook signatures.
- Protect against replay and duplicate processing.
- Keep structured logs free from secrets and unnecessary PII.
- Maintain audit trails for sensitive operations.

Detailed rules live in:

- `docs/security/security-baseline.md`
- `docs/security/authentication.md`
- `docs/security/audit-logging.md`
- `docs/security/secrets-management.md`

Before pushing credential/integration changes, run `pnpm secrets:check`. CI enforces the same repository guardrail.
