# Quality Gates

## Pull request gate

- [ ] formatting
- [ ] lint
- [ ] typecheck
- [ ] unit tests
- [ ] integration tests where relevant
- [ ] E2E for critical flows
- [ ] build
- [ ] documentation impact reviewed
- [ ] Mermaid impact reviewed
- [ ] migration impact reviewed
- [ ] security impact reviewed
- [ ] accessibility reviewed for UI changes
- [ ] no secrets
- [ ] no unintended changes

## Critical E2E targets

- login/logout
- connect/reconnect social account
- create/edit job
- create/save draft
- platform variants
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
- backup/restore state known
