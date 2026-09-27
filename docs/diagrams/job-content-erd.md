# Job and Content ERD

This Phase 3 view focuses on Job Hub, content drafts, platform variants, and private media metadata.

```mermaid
erDiagram
    JOB ||--o{ POST : has
    POST ||--o{ POST_VARIANT : renders
    POST ||--o{ MEDIA_ASSET : owns

    JOB {
      uuid id PK
      text title
      text companyName
      text description
      text location
      enum employmentType
      enum status
      text currency
      bigint salaryMinMinor
      bigint salaryMaxMinor
      text sourceRef
      text commissionNote
      timestamptz createdAt
      timestamptz updatedAt
    }

    POST {
      uuid id PK
      uuid jobId FK
      text title
      text baseContent
      text language
      enum status
      timestamptz createdAt
      timestamptz updatedAt
    }

    POST_VARIANT {
      uuid id PK
      uuid postId FK
      enum platform
      text text
      text_array hashtags
      text link
      jsonb metadata
      timestamptz createdAt
      timestamptz updatedAt
    }

    MEDIA_ASSET {
      uuid id PK
      uuid postId FK
      enum kind
      text storageKey UK
      text originalFileName
      text mimeType
      bigint sizeBytes
      text checksumSha256
      int width
      int height
      int durationMs
      text altText
      timestamptz createdAt
      timestamptz updatedAt
    }
```

`MediaAsset` stores metadata and a private object-storage key, not public file bytes or a permanent public URL. The upload/persistence UI flow remains a separate incomplete Master Plan item.
