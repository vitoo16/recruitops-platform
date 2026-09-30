# API and Worker Error Monitoring

RecruitOps uses Sentry for server-side exception monitoring in the API and publication worker.

## Runtime contract

- `SENTRY_DSN` is optional. When it is empty or absent, monitoring is disabled and both services continue normally.
- When configured, the API and worker initialize `@sentry/node` with the current `NODE_ENV` and `sendDefaultPii: false`.
- The API tags events with `service=recruitops-api` and, when available, the normalized request correlation ID.
- The worker tags events with `service=recruitops-worker` plus bounded operational event/code tags.
- No provider token, OAuth credential, CV/candidate PII, request body, signed media URL, database URL, Redis URL, or secret value is attached by this integration.

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

`SENTRY_DSN` already exists as an optional deployment placeholder. Configure it only through the deployment platform's secret/environment management. Never commit a DSN or auth token to the repository.

A real hosted Sentry project/DSN is an environment concern and is not required for local development or CI. CI validates that the disabled path remains buildable without secrets.
