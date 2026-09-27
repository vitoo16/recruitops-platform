# Publication State

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Scheduled
    Pending --> Publishing
    Pending --> Cancelled
    Scheduled --> Publishing
    Scheduled --> Cancelled
    Publishing --> Processing
    Publishing --> Published
    Publishing --> RetryWaiting
    Publishing --> Failed
    Processing --> Published
    Processing --> RetryWaiting
    Processing --> Failed
    RetryWaiting --> Publishing
    RetryWaiting --> Cancelled
    Failed --> Publishing: manual retry
    Failed --> Cancelled
    Published --> [*]
    Cancelled --> [*]
```

The shared contract in `@recruitops/contracts` is the executable source for allowed state transitions. This diagram documents that contract and must change in the same PR if transition rules change.
