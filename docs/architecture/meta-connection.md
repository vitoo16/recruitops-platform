# Meta Official Connection Boundary

## Scope verified for this slice

RecruitOps uses Meta's official OAuth/Graph API path only. The current connection boundary supports discovery for:

- Facebook Pages managed by the authenticated Facebook user;
- Instagram Professional accounts linked to those Pages through **Instagram API with Facebook Login**.

The integration does not use private endpoints, browser session scraping, undocumented cookies, or consumer Instagram accounts.

## Permissions

Facebook Page target requests only:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

Instagram Professional target through Facebook Login requests only:

- `pages_show_list`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_content_publish`

When both targets are selected the permission set is de-duplicated. Messaging, comments, ads, insights, business-management and other unrelated scopes are intentionally excluded from this connection boundary.

## OAuth flow

```mermaid
sequenceDiagram
    actor User
    participant UI as RecruitOps UI
    participant API as RecruitOps API
    participant Redis as Private Redis TTL Store
    participant Meta as Meta OAuth / Graph API
    participant Store as Durable Encrypted Credential Store

    User->>UI: Connect Facebook / Instagram
    UI->>API: POST /integrations/meta/oauth/start + selected targets
    API->>API: Generate 32-byte random OAuth state
    API->>Redis: SET SHA256(state) + user/targets, NX, TTL 10m
    API-->>UI: Official Meta authorization URL
    UI->>Meta: Redirect user to consent dialog
    Meta-->>API: Callback with code + state
    API->>Redis: GETDEL SHA256(state)
    Redis-->>API: Bound user/targets exactly once
    API->>Meta: Exchange code for user access token
    Meta-->>API: Short-lived user access token
    API->>Meta: Exchange for long-lived user token
    Meta-->>API: Long-lived user access token
    API->>Meta: GET /me/accounts
    Meta-->>API: Managed Pages + Page access tokens
    opt Instagram requested
        API->>Meta: Query Page-linked Instagram Professional account
        Meta-->>API: Instagram professional account metadata when linked
    end
    API->>API: Encrypt long-lived user token with AES-256-GCM
    API->>Redis: Store encrypted token + non-secret discovery metadata, TTL 15m
    API-->>UI: connectionSessionId + non-secret account metadata
    UI->>API: Later authenticated account-selection request
    API->>Store: Promote only explicitly selected provider credentials
```

## State and temporary session security

OAuth state is API-generated from 32 cryptographically random bytes. The raw state value is sent only through the authorization redirect; Redis stores only `SHA-256(state)` as the key, bound to the initiating RecruitOps user ID and requested targets.

State records expire after 10 minutes and are consumed with Redis `GETDEL`, making callback validation atomic and one-time. An expired, unknown or replayed state fails before RecruitOps contacts Meta.

After a successful callback, RecruitOps creates a separate 15-minute selection session. The long-lived Meta user token is encrypted with the same AES-256-GCM keyring used by the durable OAuth credential boundary before it is written to Redis. Page access tokens returned by `/me/accounts` are not persisted in the temporary session; they are rediscovered when the operator later confirms which account destinations to connect.

The selection session is bound to the initiating user and contains only:

- requested targets;
- encrypted Meta user-token envelope;
- non-secret Page / Instagram Professional metadata;
- creation and expiration timestamps.

## Logging boundary

HTTP and authentication/authorization audit logging records request paths only. Query strings are stripped before logging so OAuth callback `code` and `state` values cannot enter the current Render/stdout log path.

The callback also returns `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## Provider boundary

`@recruitops/integrations` never persists credentials and never logs provider response bodies. The Meta app secret is used only server-side during token exchange. Resource requests use bearer authorization headers so access tokens are not placed in RecruitOps-generated Graph API query strings.

The API version is explicit configuration (`META_GRAPH_API_VERSION`) rather than silently hard-coded into product logic. The redirect URI is explicit configuration (`META_REDIRECT_URI`) and must match the Meta app configuration exactly.

## Current product boundary

This slice still does **not** auto-connect every managed Page. A single Meta login can expose multiple Pages and linked Instagram Professional accounts, so RecruitOps preserves human choice rather than inventing a business rule.

The next connection step must require an authenticated `OWNER` or `ADMIN` to choose the account destinations to promote from the temporary selection session. Only then may RecruitOps create/update `SocialAccount` rows and pass selected provider credentials to `OAuthCredentialStore`.

## Production activation still required

1. approved Meta app configuration and exact redirect URI;
2. App Review / advanced access where Meta requires it for non-role users;
3. runtime `META_CLIENT_ID`, `META_CLIENT_SECRET`, `META_GRAPH_API_VERSION` and `META_REDIRECT_URI` configuration;
4. production OAuth encryption key provisioning;
5. hosted `social_credentials` migration execution;
6. authenticated account-selection / credential-promotion flow and UI;
7. integration/E2E verification against the configured Meta app.

Until those are complete, the Master Plan Meta connection item remains unchecked.
