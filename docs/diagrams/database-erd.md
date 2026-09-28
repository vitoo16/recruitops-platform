# Implemented Database ERD

This diagram contains implemented persisted models only. Planned Commission/Reconciliation entities are intentionally excluded until their schema exists.

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
```

`PostVariantMediaAsset` is an explicit ordered join. Its `position` controls provider payload ordering and its foreign keys prevent selections from referring to missing variants/assets. The API additionally verifies that every selected asset belongs to the same canonical Post as the PostVariant.

`MediaAsset.storageKey` and `CandidateDocument.storageKey` are private object-storage references, not public URLs. `SocialAccount.credentialRef` references an encrypted `SocialCredential` envelope and is never itself a provider token.
