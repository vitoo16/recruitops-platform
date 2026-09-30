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
- [ ] dependency review passes for dependency changes introduced by the pull request
- [ ] CodeQL JavaScript/TypeScript scan completes and security findings are triaged
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

The resolved dependency audit runs on pull requests and pushes to `main`. GitHub Dependency Review separately evaluates dependency changes introduced by pull requests and blocks known vulnerabilities at `moderate` severity or higher. CodeQL analyzes JavaScript/TypeScript source with the `security-extended` suite on pull requests, `main`, and a weekly schedule.

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
