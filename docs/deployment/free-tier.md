# Free-tier Deployment Guide

## Chosen topology

| Concern | Provider | Initial tier |
|---|---|---|
| Frontend | Render Static Site | Free |
| API | Render Web Service | Free |
| PostgreSQL | Supabase | Free project |
| CV/media storage | Supabase Storage / S3-compatible access | Free project quota |
| Redis | Render Key Value | Free |
| External scheduled HTTP trigger | Upstash QStash | Free quota where applicable |

This is an MVP/hobby topology. It is intentionally portable rather than production-SLA oriented.

## Provisioned free resources

```text
Supabase project: recruitops-platform
Supabase ref: ybkmijhhhuqzatpnigsq
Supabase region: ap-southeast-1 (Singapore)
Supabase URL: https://ybkmijhhhuqzatpnigsq.supabase.co
Private storage bucket: recruitops-private

Render frontend: recruitops-frontend
Frontend URL: https://recruitops-frontend.onrender.com

Render API: recruitops-api
API URL: https://recruitops-api.onrender.com
API region: Singapore

Render Redis: recruitops-redis
Redis region: Singapore
Redis plan: Free
```

No database password, Redis connection credential, S3 secret, service-role key, OAuth secret, or other credential is committed to this repository.

## Render configuration

`render.yaml` defines the intended reproducible configuration for:
- `recruitops-frontend`: static Next.js export from `apps/web/out`;
- `recruitops-api`: NestJS Node web service in Singapore;
- monorepo build/start commands;
- `/api/health` health check;
- secret placeholders using `sync: false` instead of committed secret values.

Render already provides pnpm for this repository through `packageManager`. Do not run `corepack enable` in Render build commands because its build filesystem can expose the system pnpm shim as read-only.

## Supabase

The project is provisioned in Singapore (`ap-southeast-1`).

When the database module is enabled, provide the API with:

```text
DATABASE_URL=<Supabase Postgres connection string compatible with Prisma>
```

When S3-compatible storage credentials are enabled, provide:

```text
STORAGE_ENDPOINT=<Supabase S3 endpoint>
STORAGE_REGION=<Supabase storage region>
STORAGE_BUCKET=recruitops-private
STORAGE_ACCESS_KEY_ID=<secret>
STORAGE_SECRET_ACCESS_KEY=<secret>
```

`recruitops-private` already exists as a private bucket. Candidate CV access must remain authorization-controlled.

## Render Key Value

`recruitops-redis` is already provisioned on the Render Free plan in Singapore.

When the queue module is enabled, set:

```text
REDIS_URL=<private/internal Render Key Value connection URL>
```

Prefer the provider's private/internal connection path from services in the same region. Never commit the credential-bearing URL.

## QStash

The Render API can sleep when idle. Future scheduled publishing may use QStash to call an authenticated API endpoint at a scheduled time. QStash is only a delivery/wake-up bridge, not the business source of truth.

Future scheduled endpoint requirements:
- verify QStash signatures;
- use idempotency keys;
- perform bounded work in the HTTP request;
- enqueue durable work where possible;
- return safely for duplicate delivery.

## Current API foundation

The current foundation API exposes health functionality and does not yet consume PostgreSQL or Redis. Therefore `DATABASE_URL` and `REDIS_URL` are optional at process bootstrap until the corresponding modules are implemented. Each future module must validate its required configuration when enabled.

Current runtime values include:

```text
NODE_ENV=production
PORT=10000
CORS_ORIGINS=https://recruitops-frontend.onrender.com
STORAGE_BUCKET=recruitops-private
```

Leave future social credentials unset until each integration phase starts.

## Free-tier limitations

- Render Free Web Services can sleep after inactivity and cold-start on the next request.
- Free compute, bandwidth, build minutes, storage and Redis capacity are bounded.
- Do not promise exact-time publishing from a sleeping free API.
- Do not deploy business-critical background processing until an always-on worker is available.

## Production upgrade path

```text
Render Static Site
       |
Always-on API
       |
PostgreSQL + Object Storage
       |
Redis queue
       |
Dedicated Worker(s)
```
