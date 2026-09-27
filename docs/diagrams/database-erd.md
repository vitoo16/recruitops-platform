# Current Database ERD

This diagram reflects the models that currently exist in `packages/database/prisma/schema.prisma`. Planned commission and reconciliation models are intentionally excluded until they are implemented.

```mermaid
erDiagram
    JOB ||--o{ POST : has
    JOB ||--o{ APPLICATION : receives
    POST ||--o{ POST_VARIANT : renders
    POST ||--o{ MEDIA_ASSET : owns
    POST_VARIANT ||--o{ PUBLICATION : distributed_as
    SOCIAL_ACCOUNT ||--o{ DESTINATION : owns
    SOCIAL_ACCOUNT o|--o{ PUBLICATION : authorizes
    DESTINATION ||--o{ PUBLICATION : targets
    DESTINATION o|--o{ APPLICATION : sources
    CANDIDATE ||--o{ APPLICATION : makes
    CANDIDATE ||--o{ CANDIDATE_DOCUMENT : owns
    APPLICATION o|--o{ CANDIDATE_DOCUMENT : attaches

    JOB {
      uuid id PK
      text title
      text companyName
      enum employmentType
      enum status
      text currency
      bigint salaryMinMinor
      bigint salaryMaxMinor
      timestamptz createdAt
      timestamptz updatedAt
    }

    POST {
      uuid id PK
      uuid jobId FK
      text title
      text language
      enum status
    }

    POST_VARIANT {
      uuid id PK
      uuid postId FK
      enum platform
      text text
      text_array hashtags
    }

    MEDIA_ASSET {
      uuid id PK
      uuid postId FK
      enum kind
      text storageKey UK
      text mimeType
      bigint sizeBytes
    }

    SOCIAL_ACCOUNT {
      uuid id PK
      enum platform
      text externalAccountId
      enum status
      text credentialRef
      timestamptz expiresAt
    }

    DESTINATION {
      uuid id PK
      uuid socialAccountId FK
      enum platform
      enum type
      enum postingMode
      boolean enabled
    }

    PUBLICATION {
      uuid id PK
      uuid postVariantId FK
      uuid destinationId FK
      uuid socialAccountId FK
      enum state
      text idempotencyKey UK
      timestamptz scheduledAt
      timestamptz publishedAt
      int retryCount
    }

    CANDIDATE {
      uuid id PK
      text fullName
      text emailNormalized
      text phoneNormalized
    }

    APPLICATION {
      uuid id PK
      uuid candidateId FK
      uuid jobId FK
      uuid sourceDestinationId FK
      enum status
      enum sourcePlatform
      timestamptz sourcedAt
      timestamptz worked30DaysAt
    }

    CANDIDATE_DOCUMENT {
      uuid id PK
      uuid candidateId FK
      uuid applicationId FK
      enum kind
      text storageKey UK
      text mimeType
      bigint sizeBytes
    }
```

The Prisma schema is the persistence source of truth. When the schema changes, this diagram must be updated in the same implementation slice.
