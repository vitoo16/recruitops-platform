# Social Domain ERD

```mermaid
erDiagram
    SOCIAL_ACCOUNT o|--o| SOCIAL_CREDENTIAL : protects_with
    SOCIAL_ACCOUNT ||--o{ DESTINATION : authorizes

    SOCIAL_ACCOUNT {
      uuid id PK
      enum platform
      text external_account_id
      text display_name
      enum status
      text_array scopes
      text credential_ref UK_FK
      timestamptz expires_at
      timestamptz created_at
      timestamptz updated_at
    }

    SOCIAL_CREDENTIAL {
      text id PK
      enum platform
      text key_id
      text algorithm
      bytea iv
      bytea auth_tag
      bytea ciphertext
      timestamptz created_at
      timestamptz updated_at
    }

    DESTINATION {
      uuid id PK
      enum platform
      enum type
      text name
      text external_id
      text url
      enum posting_mode
      boolean enabled
      text_array tags
      uuid social_account_id FK
      timestamptz created_at
      timestamptz updated_at
    }
```

`credential_ref` is never an OAuth token. It references a protected record containing only authenticated-encryption metadata and ciphertext. Provider access/refresh tokens are encrypted in the server process before persistence and are not exposed in shared API contracts.
