# Job and Content Domain

## Scope

This document defines the persistent Job/Content slice used by RecruitOps APIs, UI and publication execution.

## Job

A Job is the durable representation of an active or planned recruitment opportunity.

Core fields:
- opaque UUID identifier;
- title and company name;
- description and optional location;
- employment type;
- lifecycle status;
- optional salary range represented as integer minor units;
- ISO-style three-character currency code;
- optional source reference for imported/synchronized job data;
- optional human-readable commission note.

`commissionNote` is descriptive source metadata only. Earned/paid commission remains a separate Phase 7 ledger concern.

### Job lifecycle

```text
DRAFT → ACTIVE ↔ PAUSED → CLOSED
```

## Post

A Post is canonical recruitment copy linked to one Job. It contains the shared title/base content and language before platform-specific adaptation.

Post states:
- `DRAFT`: editable working content;
- `READY`: intentionally prepared for downstream publication workflows;
- `ARCHIVED`: terminal content state for the current workflow.

A Post may move between Draft and Ready. Archived posts cannot silently return to Draft through the shared domain transition helper.

## PostVariant

A PostVariant is the platform-specific rendering of one canonical Post.

Current platform identifiers:
- Facebook
- Instagram
- Threads
- LinkedIn
- TikTok
- Zalo

One Post may have at most one variant per platform. Variant text, hashtags, optional link and platform metadata are persisted behind authenticated NestJS APIs.

### Explicit media selection

A Post owns the private media library. A PostVariant does not automatically inherit all Post media.

`PostVariantMediaAsset` is an explicit ordered selection joining one PostVariant to approved MediaAssets. The API replaces a variant's selection transactionally and verifies that every selected asset belongs to the same canonical Post. Duplicate asset IDs are rejected at the contract boundary; database primary/unique constraints enforce asset uniqueness and one stable position per variant.

An empty selection is valid at the generic content layer. Provider adapters remain responsible for capability rules such as requiring exactly one Instagram image or Reel input.

This prevents a persistence convenience from becoming an accidental cross-platform publishing rule.

## Platform preview model

The preview surface should be driven by the same PostVariant contract persisted by the backend. The frontend must not maintain a second incompatible representation.

A preview receives:
- platform;
- text;
- hashtags;
- optional link;
- platform metadata;
- explicit ordered media IDs where applicable.

## Validation boundary

User and external input is validated before entering application/domain services. Shared Zod schemas live in `@recruitops/contracts` so web/API code can use the same contract without duplicating validation rules.
