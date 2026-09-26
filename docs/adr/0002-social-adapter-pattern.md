# ADR-0002: Isolate social providers behind adapters

## Status
Accepted

## Context
Social APIs change independently and expose different capabilities.

## Decision
Business logic depends on vendor-neutral contracts. Each provider has its own adapter. Unsupported official operations use a Manual Assist provider.

## Consequences
Provider changes remain localized, testing is easier, and unsupported automation is not disguised as supported behavior.
