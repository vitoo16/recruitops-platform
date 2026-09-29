# Architecture Overview

## Architectural style

Start as a modular monorepo with separately deployable web, API and worker applications.

Core principles:
- NestJS is the business/system-of-record boundary.
- PostgreSQL stores durable domain state.
- Redis/BullMQ handles scheduled/background work.
- Object storage holds private CV/media assets.
- n8n orchestrates external workflows but does not own core state.
- Social integrations are adapter-based.

## Runtime components

See:
- `../diagrams/system-context.md`
- `../diagrams/container-architecture.md`
- `../diagrams/social-publishing-sequence.md`
- `../diagrams/publication-state.md`
- `publication-correlation.md`

## Module boundaries

Expected NestJS domains:

```text
auth
users
jobs
content
media
social-accounts
destinations
publishing
scheduling
candidates
commissions
integrations
webhooks
notifications
audit
health
```

## Scale strategy

MVP:
- one web service;
- one API service;
- one worker service;
- one PostgreSQL;
- one Redis;
- one n8n;
- object storage.

Scale later by separating platform worker queues and increasing worker replicas without rewriting business domains.
