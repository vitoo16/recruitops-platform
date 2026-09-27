# Job Hub Request Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Recruiter
    participant Web as Next.js Job Hub
    participant Auth as Supabase Auth
    participant API as NestJS API
    participant DB as PostgreSQL via Prisma

    Recruiter->>Web: Open Job Hub
    Web->>Auth: Read current session
    Auth-->>Web: Short-lived access token
    Web->>API: GET /api/auth/me (Bearer token)
    API-->>Web: Verified role
    Web->>API: GET /api/jobs (Bearer token)
    API->>API: Validate query + RBAC
    API->>DB: Query jobs
    DB-->>API: Job rows
    API-->>Web: Typed JobListResponse
    Web-->>Recruiter: Render list/search controls

    alt OWNER / ADMIN / RECRUITER creates a job
        Recruiter->>Web: Submit create form
        Web->>Web: Validate shared CreateJobSchema
        Web->>API: POST /api/jobs
        API->>API: Authenticate + authorize + validate
        API->>DB: Insert job
        DB-->>API: Persisted job
        API-->>Web: Typed Job response
        Web->>API: Refresh GET /api/jobs
    else VIEWER attempts mutation
        API-->>Web: 403 Forbidden
        Web-->>Recruiter: Show localized authorization error
    end
```

The browser never uses the Supabase Data API to mutate RecruitOps domain tables. Supabase supplies identity; NestJS remains the domain authorization and persistence boundary.
