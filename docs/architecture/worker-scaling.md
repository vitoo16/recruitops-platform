# Publication Worker Scaling Strategy

## Purpose

This document defines how RecruitOps scales the BullMQ publication worker without weakening idempotency, provider rate limits, graceful shutdown, or the free-tier production boundary.

The current repository has a production-capable worker runtime in `apps/worker`, but `render.yaml` intentionally deploys only the frontend and API. The current free-tier topology therefore does **not** claim an always-on publication worker. Hosted worker activation remains a separate production decision.

## Current execution controls

Each worker process reads three runtime limits:

- `PUBLICATION_WORKER_CONCURRENCY` — in-process concurrent jobs, default `4`;
- `PUBLICATION_WORKER_RATE_LIMIT_MAX` — maximum jobs admitted by the BullMQ limiter during one duration window, default `10`;
- `PUBLICATION_WORKER_RATE_LIMIT_DURATION_MS` — limiter duration, default `1000` ms.

The worker:

- consumes one shared BullMQ publication queue;
- uses the Publication UUID as the BullMQ job identity;
- claims a durable Publication through compare-and-set persistence before invoking a provider;
- shuts down on `SIGTERM` / `SIGINT` by closing BullMQ before disconnecting Prisma.

Those rules remain authoritative at every scale level. Horizontal scaling must never replace database state claims or idempotency with process-local assumptions.

## Platform choice

When unattended publishing is approved for hosted operation, deploy `apps/worker` as a **Render Background Worker**, not as another Web Service and not as a Cron Job.

Why:

- it is a long-running queue consumer and does not need inbound HTTP;
- it can connect outbound to PostgreSQL, Render Key Value and provider APIs;
- Render sends `SIGTERM` during shutdown/deploy, matching the worker's existing drain path;
- Render supports manual instance counts for Background Workers and Professional+ autoscaling when the workspace tier allows it.

Do not add the hosted worker to `render.yaml` until the required server-only database, Redis, OAuth keyring, media-signing and provider activation settings have been deliberately configured and live provider gates are ready.

## Queue backend requirements

The BullMQ broker is durable operational state, not a cache.

For Render Key Value used by BullMQ:

- use private-network access where possible;
- use a `noeviction` max-memory policy so queue keys are not discarded under memory pressure;
- monitor memory before capacity is exhausted;
- do not treat Redis/Valkey as the source of truth for publication outcome — PostgreSQL Publication state remains authoritative.

If the current Key Value tier cannot provide the durability/capacity required by production load, upgrade or move the broker before increasing worker fan-out.

## Scale order

Scale in this order so each step has an observable reason.

### Level 0 — no hosted worker

Current free-tier boundary.

- publication code and queue semantics are testable;
- no claim of continuous background consumption;
- provider activation/live E2E remain gated.

### Level 1 — one worker instance, conservative limits

First production activation.

- one Background Worker instance;
- begin with the existing defaults unless provider-specific evidence requires lower values;
- verify queue drain, retry behavior, provider error/rate-limit telemetry and shutdown behavior before increasing throughput.

This is the preferred initial topology because it minimizes duplicate external-call surface while provider integrations are still being proven.

### Level 2 — tune per-process concurrency

Increase `PUBLICATION_WORKER_CONCURRENCY` only when:

- queue wait time/backlog shows sustained pressure;
- CPU and memory have headroom;
- database pool usage has headroom;
- provider latency is the dominant wait;
- rate-limit telemetry shows the provider budget is not saturated.

Decrease concurrency when database saturation, memory pressure, provider throttling, or long-running media operations appear.

Concurrency is not a provider-rate-limit guarantee. Provider-specific limits and application-wide throughput must be considered separately before raising it.

### Level 3 — manual horizontal scaling

Add worker instances when one correctly sized process cannot drain the queue within the target operational window.

Render supports manual instance counts for Background Workers. Multiple instances may consume the same BullMQ queue because RecruitOps retains:

- shared queue job identity;
- database compare-and-set execution ownership;
- durable retry state;
- fail-closed handling for ambiguous provider outcomes.

Before increasing instance count, confirm:

1. PostgreSQL connection capacity supports additional worker pools;
2. Key Value connections/memory support the extra consumers;
3. effective provider throughput remains within approved quotas;
4. observability can distinguish worker instances and provider outcomes;
5. a scale-down/deploy can drain in-flight jobs safely.

### Level 4 — Render autoscaling

Use Render autoscaling only after the workspace is Professional+ and metrics have established sensible boundaries.

- define explicit minimum and maximum instances;
- scale on CPU and/or memory only as infrastructure signals;
- retain queue depth/wait time and provider-rate telemetry as application decision signals;
- do not assume CPU autoscaling alone protects a provider quota;
- keep the minimum high enough for the required background-processing availability.

Render autoscaling can react to CPU/memory, but RecruitOps should not use it as a substitute for provider-aware backpressure.

## Provider-aware capacity

Different social providers can have different quotas, latency and processing models. A global worker concurrency value must therefore be bounded by the most restrictive active path until dedicated provider isolation exists.

Before significantly increasing throughput, add/verify provider telemetry for:

- request count;
- success/failure count;
- 429/rate-limit responses;
- provider/server 5xx responses;
- request latency;
- processing/polling duration where applicable.

If one provider begins to dominate capacity or has materially different quota behavior, the next architectural step is **provider-isolated queues/workers or provider-specific admission control**, not unlimited global concurrency. That change requires its own design/implementation PR because it changes queue topology.

## Backlog-driven operating signals

Worker scaling decisions should use at least:

- waiting/delayed/active/failed job counts;
- oldest waiting job age;
- scheduled Publications that are overdue while still `SCHEDULED`;
- retry backlog and next-retry age;
- job execution duration;
- database connection saturation;
- Key Value memory/connection pressure;
- provider latency and rate-limit errors;
- CPU and memory per worker instance.

Scale-up is justified by sustained backlog/latency with healthy dependencies, not by a single spike.

Scale-down is justified only when the queue remains healthy after reducing capacity. Never terminate workers manually in a way that bypasses graceful shutdown.

## Graceful shutdown on Render

Render sends `SIGTERM` before terminating a worker instance. RecruitOps already handles `SIGTERM` by closing the BullMQ worker and then Prisma.

For the hosted worker:

- configure Render's shutdown delay to cover the longest **safe** in-flight execution window, within the platform-supported limit;
- keep provider operations bounded with their own timeouts;
- avoid jobs that can block indefinitely;
- verify shutdown in a deployment/restart exercise before increasing instance count.

A provider call that may already have succeeded when the process dies remains an ambiguous external outcome and must follow the existing fail-closed manual-review path; scaling does not make an external provider exactly-once.

## Database connection budget

Every additional worker instance adds Prisma/database connections. Before horizontal scaling:

1. measure the API's peak database usage;
2. measure one worker instance under representative concurrency;
3. reserve capacity for migrations/operations;
4. cap worker instances so aggregate connections remain below the Supabase/database connection budget.

If database connections become the limiting resource, reduce worker concurrency/instances or introduce an approved pooling strategy before scaling further.

## Deployment progression

Production activation should progress through explicit gates:

1. provider app/account access verified;
2. required secrets configured server-side;
3. worker service declared in infrastructure-as-code;
4. Key Value configured for queue-safe retention (`noeviction`);
5. single worker smoke test;
6. real provider integration/E2E verification;
7. queue/provider observability active;
8. only then tune concurrency or add instances.

No step should silently enable Instagram/Threads/other provider activation flags merely because worker compute has been provisioned.

## Render Blueprint target shape

The future hosted shape is conceptually:

```yaml
services:
  - type: worker
    name: recruitops-worker
    runtime: node
    region: singapore
    # paid production plan chosen deliberately
    buildCommand: pnpm install --no-frozen-lockfile && pnpm --filter @recruitops/worker... build
    startCommand: pnpm --filter @recruitops/worker start:prod
    # maxShutdownDelaySeconds chosen from measured safe job duration
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false
      - key: PUBLICATION_WORKER_CONCURRENCY
        value: '4'
      - key: PUBLICATION_WORKER_RATE_LIMIT_MAX
        value: '10'
      - key: PUBLICATION_WORKER_RATE_LIMIT_DURATION_MS
        value: '1000'
```

This is an architecture target, not an instruction to provision the service in the current PR. Secret values and provider activation flags remain outside source control.

## Capacity changes checklist

For every worker capacity change:

1. record the reason and baseline metrics;
2. change one major capacity dimension at a time where practical;
3. verify queue drain and no duplicate provider outcomes;
4. inspect provider 429/5xx and latency;
5. inspect database and Key Value pressure;
6. verify graceful shutdown after deployment;
7. retain or revert the change based on observed results.

## Current conclusion

RecruitOps' code is horizontally safe only because publication identity, CAS ownership and durable state live outside any worker process. The next hosted production step is one Render Background Worker with conservative limits. Horizontal/autoscaling is a later capacity action after live provider verification and observability, not a prerequisite for the current free-tier development topology.
