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
- Reject resolved dependency graphs containing known vulnerabilities at `moderate` severity or higher.
- Keep application dependencies and GitHub Actions references current through reviewed Dependabot pull requests.

Detailed rules live in:

- `docs/security/security-baseline.md`
- `docs/security/authentication.md`
- `docs/security/audit-logging.md`
- `docs/security/secrets-management.md`

Before pushing credential/integration changes, run `pnpm secrets:check`. CI enforces the same repository guardrail.

Pull requests and pushes to `main` run `pnpm audit --audit-level=moderate` after resolving the repository's pnpm dependency graph. Dependabot opens weekly update pull requests for the root npm/pnpm workspace and GitHub Actions; those pull requests are never assumed safe merely because they were generated automatically and must pass the normal repository gates before merge.
