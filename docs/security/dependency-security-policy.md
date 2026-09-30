# Dependency Security Policy

RecruitOps blocks introduction of known dependency vulnerabilities at `moderate` severity or higher.

The policy is enforced in two complementary ways:

- `pnpm audit --audit-level=moderate` evaluates the resolved dependency graph on pull requests and pushes to `main`;
- GitHub Dependency Review evaluates dependency changes introduced by each pull request using `.github/dependency-review-config.yml`.

Dependabot remains an update source, not a trust boundary. Automated dependency PRs require the same CI, test, build, dependency, and code-scanning checks as human-authored changes.
