# Implemented Database ERD

This diagram contains implemented persisted models only. `CommissionTransaction` and `ReconciliationBatch` are both part of the Phase 7 persisted schema.

```mermaid
erDiagram
    JOB ||--o{ POST : has
    POST ||--o{ POST_VARIANT : renders
    POST ||--o{ MEDIA_ASSET : owns
    POST_VARIANT ||--o{ POST_VARIANT_MEDIA_ASSET : selects
    MEDIA_ASSET ||--o{ POST_VARIANT_MEDIA_ASSET : selected_as
    POST_VARIANT ||--o{ PUBLICATION : distributed_as
    SOCIAL_ACCOUNT o|--o| SOCIAL_CREDENTIAL : protects_with
    SOCIAL_ACCOUNT o|--o{ DESTINATION : authorizes
    SOCIAL_ACCOUNT o|--o{ PUBLICATION : authorizes
    DESTINATION ||--o{ PUBLICATION : targets
    CANDIDATE ||--o{ APPLICATION : makes
    JOB ||--o{ APPLICATION : receives
    DESTINATION o|--o{ APPLICATION : sourced_from
    CANDIDATE ||--o{ CANDIDATE_DOCUMENT : owns
    APPLICATION o|--o{ CANDIDATE_DOCUMENT : contextualizes
    CANDIDATE ||--o{ COMMISSION_TRANSACTION : earns_for
    JOB ||--o{ COMMISSION_TRANSACTION : configures
    APPLICATION ||--o{ COMMISSION_TRANSACTION : attributes
    RECONCILIATION_BATCH o|--o{ COMMISSION_TRANSACTION : snapshots
```

`PostVariantMediaAsset` is an explicit ordered join. Its `position` controls provider payload ordering and its foreign keys prevent selections from referring to missing variants/assets. The API additionally verifies that every selected asset belongs to the same canonical Post as the PostVariant.

`Application.sourceUserId` records the authenticated RecruitOps principal that sourced an application. It is intentionally stored as an immutable UUID attribution value instead of trusting a browser-supplied user ID. `Application.interviewInvitedAt` preserves the stakeholder's first commission milestone separately from the later attended-interview timestamp.

`CommissionTransaction` is an append-oriented financial ledger row linked to the candidate, job and source application. Money is stored in integer minor units. `idempotencyKey` prevents the same business event from being appended twice. `beneficiaryUserId` preserves authenticated CTV/principal attribution even though authentication users are owned by Supabase Auth rather than a local application-user table. Duplicate-CV allocation is resolved before accrual, and `reconciliationBatchId` links an accrued row to at most one payout snapshot.

`ReconciliationBatch` is an immutable payout snapshot. Batch creation selects explicit unbatched `ACCRUED` transactions, enforces the stakeholder payout class for day 5/day 15, stores a single-currency total and atomically moves selected rows to `BATCHED`. Marking a batch paid atomically moves its rows to `PAID` and records the acting user and timestamp. There is no batch-membership edit/delete route.

`MediaAsset.storageKey` and `CandidateDocument.storageKey` are private object-storage references, not public URLs. `SocialAccount.credentialRef` references an encrypted `SocialCredential` envelope and is never itself a provider token.
