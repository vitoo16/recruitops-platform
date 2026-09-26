# ADR-0001: Monorepo with deployable application boundaries

## Status
Accepted

## Context
RecruitOps requires frontend, API, background workers, shared contracts, integrations, automation, documentation and infrastructure.

## Decision
Use one monorepo with `apps/`, `packages/`, `automation/`, `docs/`, `infra/` and `tooling/`.

## Consequences
Shared contracts and governance stay synchronized while web/API/workers remain independently deployable.
