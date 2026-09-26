# Free-tier Deployment Guide

## Chosen topology

| Concern | Provider | Initial tier |
|---|---|---|
| Frontend | Render Static Site | Free |
| API | Render Web Service | Free |
| PostgreSQL | Supabase | Free project |
| CV/media storage | Supabase Storage / S3-compatible access | Free project quota |
| Redis | Upstash Redis | Free |
| External scheduled HTTP trigger | Upstash QStash | Free quota where applicable |

This is an MVP/hobby topology. It is intentionally portable rather than production-SLA oriented.

## Why not use Render Free Postgres as the long-lived development database?

Render's free Postgres tier is useful for trials, but the free database is time-limited. RecruitOps needs candidate/application data to remain durable during ongoing development, so the initial plan uses Supabase Free PostgreSQL instead.

## Render Blueprint

`render.yaml` defines:
- `recruitops-web`: static Next.js export from `apps/web/out`;
- `recruitops-api`: NestJS Node web service in Singapore;
- monorepo build/start commands;
- `/api/health` health check;
- secret placeholders using `sync: false` instead of committed secret values.

## Supabase

Create one project in the closest practical region. For Vietnam, Singapore (`ap-southeast-1`) is the preferred initial region when available.

Provide the API with:

```text
DATABASE_URL=<Supabase Postgres connection string compatible with Prisma>
STORAGE_ENDPOINT=<Supabase S3 endpoint when S3-compatible access is enabled>
STORAGE_REGION=<Supabase storage region>
STORAGE_BUCKET=recruitops-private
STORAGE_ACCESS_KEY_ID=<secret>
STORAGE_SECRET_ACCESS_KEY=<secret>
```

Create `recruitops-private` as a private bucket. Candidate CV access must remain authorization-controlled.

## Upstash Redis

Create a free Redis database in a nearby region and set:

```text
REDIS_URL=rediss://...
```

Use TLS in hosted environments. Free Redis quotas are intended for prototypes, not guaranteed production workload.

## QStash

The Render API can sleep when idle. Future scheduled publishing can use QStash to call an authenticated API endpoint at a scheduled time. QStash is a delivery/wake-up bridge, not the business source of truth.

Future scheduled endpoint requirements:
- verify QStash signatures;
- use idempotency keys;
- perform bounded work in the HTTP request;
- enqueue durable work where possible;
- return safely for duplicate delivery.

## Render environment values

After creating the Blueprint, populate every field marked `sync: false` in Render.

Minimum values for the current API foundation:

```text
CORS_ORIGINS=https://<recruitops-web>.onrender.com
DATABASE_URL=<Supabase Postgres URL>
REDIS_URL=<Upstash Redis TLS URL>
```

Leave future social credentials unset until each integration phase starts.

## Free-tier limitations

- Render Free Web Services can sleep after inactivity and cold-start on the next request.
- Free compute, bandwidth, build minutes, storage and Redis commands are bounded.
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
