# Content Draft State

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Ready: mark ready
    Ready --> Draft: return to editing
    Draft --> Archived: archive
    Ready --> Archived: archive
    Archived --> [*]
```

`Archived` is terminal in the shared domain transition helper. Restoring archived content, if ever required, must be an explicit product decision rather than an accidental state mutation.
