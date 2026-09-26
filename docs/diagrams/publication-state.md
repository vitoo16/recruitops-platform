# Publication State

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Scheduled
    Draft --> Publishing
    Scheduled --> Publishing
    Publishing --> Published
    Publishing --> RetryWaiting
    RetryWaiting --> Publishing
    Publishing --> Failed
    Failed --> Publishing: Manual retry
    Draft --> Cancelled
    Scheduled --> Cancelled
```
