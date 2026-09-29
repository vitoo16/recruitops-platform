# Publication Operations Sequences

These diagrams describe the current RecruitOps control-plane and worker behavior for immediate publishing, scheduled publishing, automatic retry, and guarded manual recovery. The durable `Publication` row and its UUID remain authoritative across API, BullMQ, worker, and provider boundaries.

## Publish now

```mermaid
sequenceDiagram
    actor Operator
    participant UI as Content Studio
    participant API as Publications API
    participant DB as PostgreSQL / Prisma
    participant Queue as BullMQ
    participant Worker as Publication worker
    participant Provider as SocialPublisher

    Operator->>UI: Publish Now
    UI->>API: publish(variant, destination, publication UUID)
    API->>API: validate READY + API destination + connected account
    API->>DB: persist/reconcile PENDING Publication
    API->>Queue: enqueue using Publication UUID as job ID
    alt queue acceptance confirmed
        Queue-->>API: accepted
        API-->>UI: QUEUED acknowledgement
    else enqueue outcome uncertain
        API-->>UI: retryable queue-acceptance error
        Note over UI,API: unchanged retry reuses the same Publication UUID
    end
    Queue-->>Worker: Publication UUID
    Worker->>DB: load projection and CAS executable state -> PUBLISHING
    Worker->>Provider: publish normalized command
    alt provider accepted synchronously
        Provider-->>Worker: published result
        Worker->>DB: persist PUBLISHED
    else provider is still processing
        Provider-->>Worker: processing result
        Worker->>DB: persist PROCESSING
    else retryable provider/server failure
        Provider-->>Worker: normalized retryable failure
        Worker->>DB: persist RETRY_WAITING + nextRetryAt
        Worker-->>Queue: throw retryable error
    else terminal failure
        Provider-->>Worker: normalized terminal failure
        Worker->>DB: persist FAILED
    end
```

`QUEUED` means BullMQ accepted dispatch; it is not provider success.

## Scheduled publication

```mermaid
sequenceDiagram
    actor Operator
    participant UI as Content Studio
    participant API as Publications API
    participant DB as PostgreSQL / Prisma
    participant Queue as BullMQ
    participant Worker as Publication worker

    Operator->>UI: choose destination + local date/time
    UI->>UI: convert browser-local date/time to absolute ISO instant
    UI->>API: schedule(variant, destination, scheduledAt, publication UUID)
    API->>API: validate READY + API destination + connected account
    API->>API: require future instant and reject known expiry conflict
    API->>DB: persist/reconcile SCHEDULED Publication
    API->>Queue: enqueue same UUID with delay
    Queue-->>API: delayed job accepted
    API-->>UI: persisted SCHEDULED state
    UI->>API: refresh status/calendar
    API->>DB: read authoritative Publication rows
    DB-->>API: SCHEDULED record
    API-->>UI: calendar entry
    Note over Queue,Worker: wait until scheduled instant
    Queue-->>Worker: same Publication UUID
    Worker->>DB: CAS SCHEDULED -> PUBLISHING
```

If `scheduledAt` passes while the durable row remains `SCHEDULED`, operators treat it as a queue/worker health signal rather than provider failure.

## Automatic retry

```mermaid
sequenceDiagram
    participant Worker as Publication worker
    participant DB as PostgreSQL / Prisma
    participant Queue as BullMQ

    Worker->>DB: persist RETRY_WAITING + retry metadata
    Worker-->>Queue: PublicationRetryableError
    Queue->>Queue: bounded exponential backoff
    Queue-->>Worker: redeliver same Publication UUID
    Worker->>DB: CAS RETRY_WAITING -> PUBLISHING
    alt claim acquired
        DB-->>Worker: owned
        Note over Worker: execute next provider attempt
    else state changed or another worker owns it
        DB-->>Worker: no row claimed
        Note over Worker: no provider call
    end
```

Automatic retry is bounded to the configured Publication retry budget; the generic executor retries only normalized HTTP 429 and provider/server failures with status 500 or greater.

## Manual retry and ambiguous outcome gate

```mermaid
sequenceDiagram
    actor Operator
    participant UI as Content Studio
    participant API as Publications API
    participant DB as PostgreSQL / Prisma
    participant Queue as BullMQ
    participant Worker as Publication worker

    Operator->>UI: Retry failed publication
    UI->>API: retry(publicationId, expected updatedAt)
    API->>DB: load current Publication
    alt state is not FAILED
        API-->>UI: 409 fail closed
    else ambiguous outcome or idempotency mismatch
        API-->>UI: manual review required; no replay
    else retry eligible
        API->>DB: optimistic retry-budget reset
        API->>Queue: inspect job by Publication UUID
        alt retained job is failed
            API->>Queue: retry retained job and reset attempts
        else retained job is missing
            API->>Queue: enqueue same Publication UUID
        else job already queued or active
            Queue-->>API: existing queue state
        else incompatible queue state
            API-->>UI: fail closed
        end
        API->>DB: reload authoritative Publication state
        API-->>UI: retry acceptance/status
        Queue-->>Worker: same Publication UUID when runnable
    end
```

A Publication already persisted as `PUBLISHING` after an interrupted provider call is an ambiguous external outcome. RecruitOps does not automatically or manually replay it until an operator verifies the provider side.