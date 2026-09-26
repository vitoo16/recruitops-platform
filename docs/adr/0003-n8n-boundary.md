# ADR-0003: n8n is orchestration, not system of record

## Status
Accepted

## Context
n8n is useful for changing operational workflows, but core hiring/publication/commission state needs strict domain ownership.

## Decision
NestJS/PostgreSQL own business state. n8n handles external orchestration such as email, sheet sync, notifications and scheduled reports.

## Consequences
Workflows can change quickly without fragmenting business truth across automation nodes.
