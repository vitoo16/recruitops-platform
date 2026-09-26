# Authentication Session Sequence

```mermaid
sequenceDiagram
    actor U as Recruiter
    participant W as Static Next.js Web
    participant SA as Supabase Auth
    participant A as NestJS API

    U->>W: Submit email + password
    W->>SA: signInWithPassword
    SA-->>W: Session (access + refresh tokens)
    Note over W: Supabase SDK owns session persistence/refresh
    W->>A: GET /api/auth/me + Bearer access token
    A->>SA: GET /auth/v1/user + publishable key + Bearer token
    SA-->>A: Authenticated user record
    A->>A: Resolve app_metadata.recruitops_role
    A-->>W: Verified principal (id, email, role)
    W-->>U: Authenticated UI state
```

The API treats the browser token as untrusted until Supabase Auth validates it. RecruitOps does not log or persist bearer tokens outside the Supabase client-managed browser session.
