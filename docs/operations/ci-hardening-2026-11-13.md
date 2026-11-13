# RecruitOps CI resource and reliability baseline — 2026-11-13

**State:** audit + first low-risk orchestration change; NOT a completed optimization or release approval.
**Base commit:** `f1e1cd7cf4ba7dc73f4552bca7b782c33820c167` on `main`. **Change branch:** `ci/harden-actions-20261113`.

## Source-backed inventory

- Monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `apps/worker`; `packages/contracts`, `database` (Prisma/PostgreSQL), `queue` (Redis/BullMQ), `integrations`, `config`; `infra`, `automation/n8n` and documentation.
- Existing workflows (all retained): `ci.yml`, `integration.yml`, `e2e.yml`, `web-performance.yml`, `dependency-review.yml`, `codeql.yml`, `autoskills-audit.yml`, `lockfile-export.yml`, `lockfile-commit.yml`.
- Existing quality boundary: typecheck, unit, build, infrastructure, secrets, worker integration, dependency security, CodeQL, web functional Playwright, and separate production-static-export synthetic performance budgets (desktop and mobile).
- `turbo.json` manages generate, build, typecheck and test tasks with dependency ordering. Web E2E executes a dev server; web performance builds production export. These **must not be conflated**.

## Confirmed reliability blocker

The committed `pnpm-lock.yaml` at the base commit has a root importer containing only `packageManagerDependencies: pnpm@12.6.0`. There are no importers for `apps/*` and `packages/*`, and no application dependency entries. Do not switch CI to `--frozen-lockfile` or `cache: pnpm` before regenerating, reviewing and validating the complete workspace lockfile. Its missing coverage is a stronger reliability issue than CI duration. Retain existing install behavior temporarily rather than introducing guaranteed CI failures.

## Applied first change

Eight PR-capable workflows now cancel obsolete *runs of the same workflow for the same pull request*. `push` on `main` and scheduled checks are not cancelled. `lockfile-commit.yml` was deliberately left unchanged because it mutates branches; its behavior should be reviewed after lockfile repair. This does not remove, move or alter any test command and does not represent verified runtime savings.

## Next verification sequence

1. Regenerate a complete workspace lockfile with pinned Node/pnpm on a clean environment and diff all importer graphs; verify `pnpm install --frozen-lockfile` both locally and on a real GitHub-hosted runner.
2. Add pnpm store caching to appropriate jobs only after step 1; verify cache key isolation, integrity, clean build and no secrets/artifact leakage.
3. Map source paths to dependent test suites; compare a full run with representative API/worker/web/contracts/schema/security PRs, including unknown-path fallback.
4. Preserve separate CodeQL and security checks, integration service tests, browser E2E and release/performance budgets; add missing lint/docs gate only with a genuine runnable implementation.
5. Measure baseline and changed job scheduling delay, runner-minute usage, failed-step distribution and PR feedback latency at comparable commits. Cancellation is *not* evidence of correctness.
6. Only after same-SHA green proof: consider consolidating duplicated setup/build, then configure appropriate branch rules and documented rollback.

## Acceptance/constraints

No test is deleted, disabled or converted to non-blocking. Do not count skipped jobs as PASS. Verify that a failed security, integration or performance gate blocks the final required check. Do not overwrite any existing agent task completion. No runtime/application code or hosted data is modified by this patch.
