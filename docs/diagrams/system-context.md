# System Context

```mermaid
flowchart LR
    Recruiter[Recruiter / CTV]
    Admin[Admin]
    RecruitOps[RecruitOps Platform]
    Social[Social Platforms]
    Mail[Email Provider]
    Sheets[Job / Commission Sheet]
    N8N[n8n]

    Recruiter --> RecruitOps
    Admin --> RecruitOps
    RecruitOps --> Social
    RecruitOps --> N8N
    N8N --> Mail
    N8N --> Sheets
    N8N --> RecruitOps
```
