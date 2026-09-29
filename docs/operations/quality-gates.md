# Quality Gates

## Pull request gate

- [ ] formatting
- [ ] lint
- [ ] typecheck
- [ ] unit tests
- [ ] integration tests where relevant
- [ ] E2E for critical flows
- [ ] build
- [ ] dependency audit passes; known vulnerabilities at `moderate` severity or higher are blocking
- [ ] CodeQL completes for JavaScript/TypeScript and GitHub Actions workflows
- [ ] documentation impact reviewed
- [ ] Mermaid impact reviewed
- [ ] migration impact reviewed
- [ ] security impact reviewed
- [ ] accessibility reviewed for UI changes
- [ ] changed UI files reviewed against current Vercel Web Interface Guidelines
- [ ] component boundaries reviewed; no avoidable feature monolith introduced
- [ ] design-system token/override impact reviewed for UI changes
- [ ] no secrets
- [ ] no unintended changes

Dependabot is configured to propose weekly dependency updates for the root npm/pnpm workspace and GitHub Actions. Dependency update PRs must pass the same repository checks as human-authored changes; automation does not imply automatic merge.

The dependency audit runs against the resolved pnpm dependency graph on pull requests and on pushes to `main`, so it does not depend on GitHub Dependency Graph repository settings.

CodeQL advanced setup runs the `security-extended` query suite for `javascript-typescript` and `actions` on pull requests, pushes to `main`, and a weekly scheduled scan. Results are uploaded to GitHub code scanning through the repository-scoped `security-events: write` permission. CodeQL findings must be triaged before production readiness is claimed; the workflow does not auto-dismiss or auto-fix alerts.

## Critical E2E targets

- login/logout
- connect/reconnect social account
- create/edit job
- create/save draft
- platform variants
- explicit ordered platform media selection
- destination selection
- schedule/publish
- failure/retry
- idempotent no-duplicate publishing
- Facebook Group Manual Assist
- candidate intake
- CV upload
- duplicate candidate handling
- email submission
- candidate status lifecycle
- commission events
- VI/EN switch
- RBAC

## Release gate

- production build
- environment validation
- migration plan
- rollback plan
- monitoring/alerts
- smoke tests
- critical E2E
- secret storage verified
- dependency/security scanning state reviewed
- backup/restore state known
