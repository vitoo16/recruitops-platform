# Web Performance Review

## Scope

RecruitOps has a repeatable synthetic browser performance gate for the public web shell. The gate runs the actual Next.js production static export and serves the generated `out/` directory through a local static HTTP server before evaluating both desktop and mobile Chromium emulation.

This is a regression guardrail, not a claim about real-user Core Web Vitals. Real production compliance still requires field/RUM data evaluated at the 75th percentile, separately for mobile and desktop traffic.

## Current synthetic budgets

| Metric | CI budget | Purpose |
| --- | ---: | --- |
| Largest Contentful Paint (LCP) | <= 2500 ms | Loading guardrail aligned with the Web Vitals "good" threshold. |
| Cumulative Layout Shift (CLS) | <= 0.1 | Visual-stability guardrail aligned with the Web Vitals "good" threshold. |
| Main-thread blocking time | <= 300 ms | Lab-only long-task/TBT-style proxy; it is not INP. |
| JavaScript raw static body | <= 1.45 MB | Detect accidental client-bundle growth against the current production-export baseline. |
| Stylesheet raw static body | <= 50 KB | Detect accidental CSS growth against the current production-export baseline. |
| Total `/_next/static/` raw body | <= 1.5 MB | Bound aggregate uncompressed production-export static assets loaded by the shell. |

Google's current Core Web Vitals targets are LCP <= 2.5 seconds, INP <= 200 ms, and CLS <= 0.1 at the 75th percentile of real page visits. INP cannot be faithfully measured without real interactions in field data; lab tooling uses blocking-time measures as a proxy instead. The CI gate therefore does not label its blocking-time measurement as INP.

The static payload budgets deliberately use browser `decodedBodySize` and classify assets by URL extension. The local Python static server does not apply gzip/Brotli, so these values are raw build-body baselines rather than claims about compressed production transfer size. Hosting/CDN compression remains an environment concern.

## Initial calibrated baseline

The first successful measurement path on 2026-09-30 established the following pre-budget snapshot from the same production export on GitHub-hosted Chromium runners:

| Metric | Desktop Chromium | Mobile Chromium |
| --- | ---: | ---: |
| LCP | 104 ms | 116 ms |
| CLS | 0.0398 | 0 |
| Main-thread blocking | 12 ms | 20 ms |
| JavaScript raw body | 1,369,557 B | 1,369,557 B |
| Stylesheet raw body | 23,551 B | 23,551 B |
| Total static raw body | 1,393,108 B | 1,393,108 B |

These lab numbers are useful as a regression baseline only. They should not be compared directly with production field percentiles.

## Test boundary

`apps/web/playwright.performance.config.ts` differs from functional E2E intentionally:

- builds the Next.js production static export and serves `out/` rather than using the development server;
- uses a separate port and output directory;
- runs one worker without retries so a budget regression is not hidden by retry;
- runs Desktop Chrome and Pixel 7 emulation;
- mocks external API/Supabase authentication boundaries so third-party latency does not dominate frontend regression measurements.

`apps/web/performance/public-shell.performance.spec.ts` installs browser `PerformanceObserver`s before navigation and attaches a JSON snapshot containing the observed metrics and budgets to the Playwright result.

## Interpretation

A CI failure means the current branch exceeded the repository's deterministic synthetic budget and should be investigated before merge. It does **not** prove production users are slow, just as a passing run does **not** prove production Core Web Vitals are good.

Payload budget changes must be based on corrected measurement semantics, an intentional product tradeoff, or an optimized/new baseline documented in the same PR. A budget must not be raised merely to silence a regression.

For production readiness, add RUM once a stable production traffic source and telemetry destination are available, then evaluate LCP, INP, and CLS at p75 by mobile/desktop population. Until then this CI gate is the regression baseline.

## Review findings

The existing public shell is sufficiently bounded to establish budgets without changing product UI. The review therefore adds measurement and regression protection rather than speculative visual rewrites. Future feature work that materially increases JavaScript, CSS, layout instability, or loading cost must either optimize back under budget or document and justify an intentional budget change in the same PR.
