# Content and Media Flow

```mermaid
sequenceDiagram
    actor Recruiter
    participant Web as Content Studio
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Storage as Private Supabase Storage

    Recruiter->>Web: Choose Job + draft content
    Web->>API: POST /api/posts + Bearer token
    API->>DB: Verify Job and create Post
    DB-->>API: Post
    API-->>Web: Draft Post
    Recruiter->>Web: Choose image/video
    Web->>Web: Validate MIME + size and generate object key
    Web->>Storage: Upload user/media/post/object.ext
    Storage-->>Web: Upload success
    Web->>API: POST /api/files/media-assets
    API->>API: Verify role + user/post key namespace
    API->>DB: Verify Post and persist MediaAsset metadata
    DB-->>API: MediaAsset
    API-->>Web: Registered media metadata
```

A storage upload that fails is never registered as a `MediaAsset`. A metadata registration failure does not make the object public; cleanup/reconciliation of orphaned private objects can be added as an operational maintenance flow later.
