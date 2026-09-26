# Candidate / Application Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Sourced
    Sourced --> Submitted
    Submitted --> InterviewInvited
    InterviewInvited --> Interviewed
    Interviewed --> Rejected
    Interviewed --> Hired
    Hired --> Working
    Working --> Worked30Days
    Rejected --> [*]
    Worked30Days --> [*]
```
