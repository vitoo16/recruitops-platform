# Publication Execution Boundary

## Purpose

The publication executor is the stateful boundary between a validated BullMQ publication job and a vendor-neutral `SocialPublisher` implementation.

It deliberately does not own provider credentials, provider SDK setup, or media URL generation. Those remain runtime resolver responsibilities.

## Execution rules

For one durable Publication job, the executor:

1. loads the current Publication execution projection;
2. treats `PUBLISHED`, `CANCELLED`, and `PROCESSING` as idempotent no-op states;
3. rejects an idempotency-key mismatch;
4. fails closed if the destination is disabled, manual-only, missing a connected social account, or platform-inconsistent;
5. resolves a publisher through the vendor-neutral registry;
6. atomically claims the Publication by moving its current executable state to `PUBLISHING`;
7. validates the normalized `PublishCommand` through the selected adapter;
8. persists `PUBLISHED` or `PROCESSING` provider results;
9. classifies provider failures into retryable and terminal outcomes.

Only HTTP 429 and provider/server errors with status >= 500 are treated as retryable by the generic executor. Provider-specific adapters remain responsible for translating provider responses into normalized safe errors.

## Prisma execution projection

`PrismaPublicationExecutionRepository` is the concrete persistence adapter used by the worker composition boundary.

Its read projection intentionally contains only execution-safe business data:

- Publication identity, state, retry count and idempotency key;
- PostVariant platform, text, hashtags, link and object-shaped metadata;
- Destination identity, platform, posting mode, enabled state and social-account reference;
- Publication SocialAccount identity, platform and connection status.

It does **not** select OAuth credentials, encrypted credential envelopes, private storage keys, or provider tokens. Credential decryption stays behind the provider context resolver at the execution point.

State claims and result writes use a single Prisma `updateMany` predicate over Publication ID plus expected state. A worker only owns an attempt when exactly one row matches. This provides the compare-and-set behavior required by the executor without relying on process-local locking.

### Media selection boundary

The current persistent model stores `MediaAsset` at the Post level. It does not yet express which assets are selected for a specific `PostVariant` / destination publication. The execution repository therefore does not infer `payload.mediaIds` by attaching every Post asset to every platform variant.

Media IDs must be supplied only after the product model exposes an explicit, validated media-selection rule. This prevents a persistence convenience from silently becoming a cross-platform publishing business rule.

## Queue handler composition

`createPublicationJobHandler` adapts the validated BullMQ `PublicationQueueJob` into the executor identity contract. Queue scheduling metadata is not treated as provider input; the durable Publication row remains the source of truth for execution state.

The handler is intentionally composition-only. It does not construct provider adapters or decrypt credentials.

## Credential and publisher runtime

OAuth credential crypto is shared between API writes and worker reads through the same AES-256-GCM implementation and payload contract. The worker never selects encrypted credential columns in the generic publication projection. A provider-specific resolver loads the exact `Destination -> SocialAccount -> SocialCredential` relation only after the executor has selected a publisher, verifies account/platform ownership again, and decrypts in memory at the execution point.

The first production runtime registry intentionally enables only the Facebook Page text/link publisher. Facebook is safe to activate before media selection exists because the implemented adapter rejects `mediaIds` and does not infer Post media. Instagram and Threads remain absent from the production registry until explicit per-variant/per-publication media selection and approved provider-readable media URL resolution exist. Requests for an unregistered platform fail closed as `PUBLICATION_PUBLISHER_UNAVAILABLE`.

## Retry behavior

The existing publication retry policy remains authoritative:

- at most five attempts;
- exponential delay beginning at one second;
- retry metadata persisted as `RETRY_WAITING`, `retryCount`, and `nextRetryAt`;
- retryable failures are rethrown as `PublicationRetryableError` so BullMQ can execute its configured retry/backoff behavior;
- terminal failures are persisted as `FAILED` and are not rethrown for automatic retry.

The executor stores normalized error codes/messages only. Raw provider response bodies, tokens, and credentials are never persisted through this boundary.

## Ambiguous provider outcome

A process can crash after a provider accepted a publish request but before RecruitOps persisted the provider result. Re-running that request blindly can create duplicate social posts because not every provider operation offers a RecruitOps-controlled idempotency primitive.

Therefore, redelivery of a Publication that is already persisted as `PUBLISHING` fails closed with `PUBLICATION_AMBIGUOUS_OUTCOME`. It is not automatically published again. A later recovery/reconciliation workflow may inspect provider state or require human review before retrying.

This is intentionally safer than assuming exactly-once external side effects.

## Concurrency

The repository boundary exposes compare-and-set state updates. Only the worker that successfully transitions the current Publication state to `PUBLISHING` owns that execution attempt. Concurrent or stale workers receive a no-op outcome rather than invoking the provider.

## Worker lifecycle

`apps/worker/src/main.ts` validates server-only database, Redis, Meta Graph version and OAuth keyring configuration before consuming the queue. Startup logs contain only normalized configuration metadata, never connection strings, provider tokens or encryption keys.

The runtime maps `redis://` / `rediss://` configuration into BullMQ connection options, starts the publication worker with configured concurrency/rate limits, and handles `SIGTERM` / `SIGINT` with idempotent graceful shutdown. BullMQ closes before Prisma disconnects so no new job can continue after the persistence layer is torn down.

## Sequence

```mermaid
sequenceDiagram
    participant Queue as BullMQ worker
    participant Handler as Worker handler
    participant Executor as Publication executor
    participant DB as Prisma repository
    participant Registry as Publisher registry
    participant Resolver as Credential resolver
    participant Provider as SocialPublisher

    Queue->>Handler: validated PublicationQueueJob
    Handler->>Executor: execute(publicationId, idempotencyKey)
    Executor->>DB: load execution projection
    DB-->>Executor: Publication + destination/account/payload
    Executor->>Executor: validate state/destination/account/platform
    Executor->>Registry: get(platform)
    Registry-->>Executor: SocialPublisher or undefined
    Executor->>DB: CAS executable state -> PUBLISHING
    alt claim lost
        DB-->>Executor: false
        Executor-->>Queue: NOOP
    else claim acquired
        DB-->>Executor: true
        Executor->>Provider: validate(PublishCommand)
        Executor->>Provider: publish(PublishCommand)
        opt provider needs credential context
            Provider->>Resolver: resolve(command)
            Resolver->>DB: load exact destination/account/credential
            Resolver->>Resolver: verify ownership + authenticated decrypt
            Resolver-->>Provider: server-side access token context
        end
        alt published
            Provider-->>Executor: PUBLISHED
            Executor->>DB: PUBLISHING -> PUBLISHED
            Executor-->>Queue: success
        else provider processing
            Provider-->>Executor: PROCESSING
            Executor->>DB: PUBLISHING -> PROCESSING
            Executor-->>Queue: processing
        else retryable failure
            Provider--xExecutor: 429 / 5xx normalized error
            Executor->>DB: PUBLISHING -> RETRY_WAITING
            Executor--xQueue: PublicationRetryableError
        else terminal failure
            Provider--xExecutor: terminal normalized error
            Executor->>DB: PUBLISHING -> FAILED
            Executor-->>Queue: failed terminal outcome
        end
    end
```

## Remaining runtime work

The queue processor can now be composed safely for the registered Facebook non-media capability. Remaining publication runtime work is intentionally scoped rather than inferred:

- define explicit media-selection semantics in the persistent product model;
- add approved private-media URL resolution and then register Instagram / Threads media publishers;
- provision a deployed worker service with the same server-only database, Redis, Graph-version and OAuth-keyring configuration;
- verify queue/database/Facebook behavior with integration/E2E coverage before calling production publishing complete;
- add recovery/reconciliation handling for ambiguous external outcomes and provider-processing states.
