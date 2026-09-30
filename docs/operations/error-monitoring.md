# Application Error Monitoring

RecruitOps uses Sentry for exception monitoring across the static web application, API and publication worker. Monitoring is optional in every runtime and must never become a prerequisite for normal application operation.

## Runtime contract

- `SENTRY_DSN` is optional for the API and worker. When it is empty or absent, server-side monitoring is disabled and both services continue normally.
- `NEXT_PUBLIC_SENTRY_DSN` is optional for the static web build. When it is empty or absent, browser monitoring is disabled. Because this value is embedded in client JavaScript, it is public client configuration rather than an authentication secret.
- The API and worker initialize `@sentry/node`; the static web application conditionally imports the lean `@sentry/browser` SDK from `instrumentation-client.ts` only when browser monitoring is configured.
- Browser monitoring is error-only in this baseline: tracing, logs, replay and automatic SDK integrations/breadcrumbs are disabled.
- Browser `beforeSend` sanitization removes user, request, breadcrumb, context, extra and transaction fields before transmission. Only the exception plus bounded SDK metadata and the `service=recruitops-web` tag are retained by this integration.
- Server-side `beforeSend` sanitization removes SDK-native user and request objects before transmission; RecruitOps adds only bounded safe operational context itself.
- The API tags events with `service=recruitops-api` and, when available, the normalized request correlation ID.
- The worker tags events with `service=recruitops-worker` plus bounded operational event/code tags.
- No provider token, OAuth credential, CV/candidate PII, request body, request headers/cookies/query string, signed media URL, database URL, Redis URL, or secret value is intentionally attached by this integration.

## Web behavior

The web application is deployed as a Next.js static export, so this slice intentionally configures browser monitoring only and does not add a Next.js server monitoring runtime.

`instrumentation-client.ts` reads `NEXT_PUBLIC_SENTRY_DSN` through a direct build-time `process.env.NEXT_PUBLIC_SENTRY_DSN` access so Next.js can inline the public value into the static client build. When the value is absent, the Sentry browser chunk is not loaded on the healthy public-shell path. When configured, the SDK is dynamically imported, initialized with default integrations disabled, and the bootstrap explicitly captures browser `error` and `unhandledrejection` events without enabling automatic click, navigation, fetch or console breadcrumbs. Non-`Error` rejection values are reduced to a generic exception rather than serialized into telemetry.

A root `global-error.tsx` boundary calls the same conditional capture helper for otherwise-fatal React errors and presents a minimal bilingual retry UI without rendering the original exception message or stack to the operator. The helper remains a no-op when the public DSN is absent.

The baseline intentionally does not enable route-transition tracing, Session Replay, Sentry logs or automatic breadcrumbs. This keeps the browser integration focused on crash/error visibility and avoids attaching navigation, click, fetch or console history to error events.

The repository Web Performance gate measures the normal CI/static-export path with no hosted Sentry credential configured. Conditional loading keeps the disabled/default path inside the established public-shell budget instead of forcing observability code into the critical bundle. Enabling a hosted browser DSN adds an asynchronous monitoring chunk after configuration and must be included in production field/performance validation during production-readiness work.

## API behavior

A global Nest interceptor observes request-handler exceptions and rethrows the original error, so RecruitOps' existing HTTP exception semantics remain authoritative. Monitoring records only the safe request method/path and request ID context.

Bootstrap failures are also captured when monitoring is configured, followed by a bounded Sentry flush before the process exits with a failure code.

## Worker behavior

The worker captures:

- startup/runtime-configuration failures;
- shutdown failures;
- unhandled promise rejections;
- uncaught exceptions through Node's `uncaughtExceptionMonitor` event without replacing Node's normal crash behavior.

Shutdown and startup-failure paths perform a bounded flush so queued monitoring events have a chance to leave the process without making Sentry availability a prerequisite for worker operation.

## Deployment

Configure `SENTRY_DSN` and, when browser monitoring is desired, `NEXT_PUBLIC_SENTRY_DSN` only through the deployment platform's environment management. Never commit a DSN value or Sentry auth token to the repository. Changes to `NEXT_PUBLIC_*` values require a new frontend build because they are compiled into the static client bundle.

A real hosted Sentry project/DSN is an environment concern and is not required for local development or CI. CI verifies the disabled path without hosted credentials.

Source-map upload is not enabled in this baseline because it requires a Sentry build/auth configuration and is not necessary for fail-closed error capture. Production source-map policy should be decided during production-readiness work before introducing any Sentry auth token into build infrastructure.
