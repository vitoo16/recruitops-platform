# Dependency and Code Security

RecruitOps applies layered repository security checks so dependency risk and source-code risk are evaluated separately.

## Pull request controls

Every pull request targeting `main` runs:

1. `pnpm audit --audit-level=moderate` against the resolved pnpm dependency graph;
2. CodeQL analysis for `javascript-typescript` using the `security-extended` query suite;
3. the repository secret-management guardrail through the normal CI workflow.

A generated dependency-update pull request is not trusted automatically. Dependabot PRs must pass the same checks as any other pull request.

## Main-branch and scheduled controls

Pushes to `main` continue to run the resolved dependency audit and CodeQL analysis. CodeQL also runs weekly so newly published query improvements or newly detectable source-code issues are evaluated even when application code has not changed.

Dependabot checks the root npm/pnpm workspace and GitHub Actions weekly.

## Blocking policy

Known dependency vulnerabilities at `moderate` severity or higher are blocking through the resolved dependency audit.

CodeQL findings are uploaded to GitHub code scanning. Security findings must be triaged before production-readiness review; fixes should include regression coverage where practical.

## Dependency Review availability

GitHub Dependency Review requires the repository Dependency Graph to be enabled. The current repository does not expose that capability to this automation connection, so RecruitOps does not install a non-functional blocking job. If Dependency Graph is enabled later by a repository administrator, Dependency Review can be added as a complementary pull-request diff gate without replacing `pnpm audit`.

## Scope and limitations

These controls do not replace:

- provider-specific security review;
- runtime monitoring and alerting;
- secret rotation and incident response;
- database and RLS review;
- production penetration testing or manual security review.

The repository must not weaken or bypass a failing security gate merely to merge a change.
