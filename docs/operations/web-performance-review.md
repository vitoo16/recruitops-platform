# Web Performance Review

## Scope

This review establishes a repeatable regression baseline for the RecruitOps web application using the repository's existing Playwright Chromium gate. It focuses on the public shell because that route is deterministic without production credentials and exercises the shared Next.js application shell, localization, styles and client bootstrap.

## Automated regression budget

`apps/web/e2e/performance.spec.ts` records and checks:

- navigation duration below 8 seconds;
- fewer than 180 loaded resource entries;
- less than 15 MiB of reported transferred resource bytes;
- no more than 20 browser long tasks during the measured navigation.

These are intentionally broad regression budgets rather than user-experience targets. Their purpose is to catch major accidental growth, runaway requests or main-thread regressions while remaining stable on shared GitHub Actions runners.

The measured values are attached to the Playwright test result as a `performance-baseline` annotation so failing runs retain the observed data alongside the normal trace/report artifacts.

## Review findings

### Positive controls already present

- Next.js owns the application/runtime bundling and route loading boundary.
- The public shell does not require production API or Supabase credentials for the browser gate; external calls are deterministically intercepted by Playwright.
- Existing UI rules require reduced-motion handling and discourage unnecessary decorative motion in operational workflows.
- Existing Playwright CI is single-worker and deterministic, reducing noise for regression checks.

### Risks to continue watching

- Feature growth can increase client JavaScript and resource count over time.
- Rich operational pages may load larger data sets than the logged-out shell and should receive route-specific budgets when stable authenticated fixtures are available.
- Third-party monitoring, analytics or provider SDKs can increase startup cost; new browser-side SDKs should be measured in this gate before rollout.
- Development-server timings include Next.js development overhead and are not suitable for claiming production Core Web Vitals.

## Production performance boundary

This repository gate is not a Lighthouse score and does not claim field Core Web Vitals. Production review should additionally use a deployed production build and, when traffic exists, real-user monitoring for LCP, INP and CLS. Those measurements depend on hosted infrastructure and real traffic conditions and therefore are not fabricated from CI.

For code review, a performance change is acceptable only when it keeps the regression gate green or deliberately updates the documented budget with evidence and rationale.

## Verification

The Phase 9 `Execute web performance review` checklist item is considered complete when the Playwright performance regression test, normal CI/typecheck/tests/build and repository quality gates pass together on the implementing PR.
