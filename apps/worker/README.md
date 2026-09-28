# Worker Application

BullMQ publishing/background workers. Workers must be idempotent, rate-limit aware, observable, and platform-isolated.

## Publication executor

The worker now consumes `dispatch-publication` jobs from the durable `publication-dispatch` BullMQ queue and executes the stored Publication through the vendor-neutral `SocialPublisher` boundary.

Execution flow:

1. validate the queue payload and canonical Publication idempotency key;
2. atomically claim a runnable `PENDING`, `SCHEDULED`, or `RETRY_WAITING` Publication by moving it to `PUBLISHING`;
3. load the durable PostVariant, Destination, SocialAccount, encrypted SocialCredential, and Post media from PostgreSQL;
4. validate destination/account/platform/credential alignment;
5. decrypt the provider credential only inside the worker execution path;
6. sign private media URLs server-side when the selected adapter needs provider-readable media;
7. call the platform `SocialPublisher` adapter;
8. persist `PUBLISHED`, `PROCESSING`, `RETRY_WAITING`, or `FAILED` state.

Retryable network, timeout, rate-limit and provider 5xx failures are persisted as `RETRY_WAITING` and rethrown to BullMQ so its bounded exponential retry policy applies. Terminal validation/provider failures are persisted as `FAILED` and acknowledged rather than consuming all queue attempts.

## Required runtime configuration

The publication worker fails closed unless these server-side values are present:

- `DATABASE_URL`
- `REDIS_URL`
- `META_GRAPH_API_VERSION`
- `OAUTH_CREDENTIAL_ACTIVE_KEY_ID`
- `OAUTH_CREDENTIAL_ENCRYPTION_KEYS`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET` (defaults to `recruitops-private`)
- `PROVIDER_MEDIA_SIGNED_URL_TTL_SECONDS` (defaults to 3600 seconds)

`SUPABASE_SECRET_KEY` is worker/server-only. It must never be exposed through `NEXT_PUBLIC_*`, browser contracts, logs, or provider payloads.

## Media boundary

`PostVariant` currently does not persist a per-variant media selection. Until that data model is introduced, the executor supplies the Post's ordered media set to the adapter. Each adapter remains responsible for rejecting unsupported media counts or kinds. This is an explicit current limitation rather than an inferred media-selection rule.

Private storage remains private. Provider adapters receive only short-lived signed HTTPS URLs created at execution time. Signed URLs are not persisted in the Publication record.

## Delivery semantics

The internal queue and database claim are duplicate-safe, but external providers do not universally expose an idempotency mechanism for every publishing operation. RecruitOps therefore does not claim exactly-once external delivery. A provider-side success followed by an ambiguous network failure can still require operator reconciliation before retrying. Publication status/error UI and recovery runbooks remain separate Master Plan work.

## Shutdown

`SIGTERM` and `SIGINT` stop the BullMQ worker, close Redis, then disconnect Prisma. New provider work is not intentionally accepted after shutdown begins.
