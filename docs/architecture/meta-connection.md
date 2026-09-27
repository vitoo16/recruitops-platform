# Meta Official Connection Boundary

## Scope verified for this slice

RecruitOps uses Meta's official OAuth/Graph API path only. The current connection boundary supports discovery and explicit promotion for:

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

## OAuth, browser return and promotion flow

```mermaid
sequenceDiagram
    actor User
    participant UI as RecruitOps UI
    participant API as RecruitOps API
    participant Redis as Private Redis TTL Store
    participant Meta as Meta OAuth / Graph API
    participant DB as PostgreSQL

    User->>UI: Choose Facebook / Instagram targets
    UI->>API: POST /integrations/meta/oauth/start
    API->>API: Validate OWNER/ADMIN + fixed frontend return configuration
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
        Meta-->>API: Instagram Professional metadata when linked
    end
    API->>API: Encrypt long-lived user token with AES-256-GCM
    API->>Redis: Store encrypted token + non-secret discovery metadata, TTL 15m
    API-->>UI: 303 fixed frontend URL + connectionSessionId only

    UI->>API: GET /integrations/meta/oauth/selection/:connectionSessionId
    API->>Redis: Read session bound to authenticated OWNER/ADMIN
    Redis-->>API: Temporary selection session
    API-->>UI: Targets + non-secret Page / Instagram metadata only
    User->>UI: Select explicit Pages / Instagram accounts
    UI->>API: POST /integrations/meta/oauth/select
    API->>Redis: Read user-bound selection session
    Redis-->>API: Encrypted user token + prior discovery metadata
    API->>API: Validate selected accounts were previously discovered
    API->>API: Decrypt temporary user token server-side
    API->>Meta: Re-discover current managed Pages / linked Instagram accounts
    Meta-->>API: Fresh Page access tokens + current linkage
    API->>API: Reject stale or no-longer-linked selections
    API->>API: Encrypt selected Page credential per target platform
    API->>DB: Transaction: upsert SocialAccount + SocialCredential + Destination
    DB-->>API: Durable connected account IDs
    API->>Redis: Delete temporary selection session
    API-->>UI: Connected account metadata only
```

## Browser return boundary

`META_FRONTEND_REDIRECT_URI` is a server-side configured URL. The browser cannot supply or override it, so the callback does not implement an arbitrary `returnTo` or open-redirect parameter.

After successful provider processing, the callback returns HTTP `303` to that fixed frontend URL with only:

- `metaConnectionStatus=ready`;
- `metaConnectionSession=<UUID>`.

The UUID is a reference to the short-lived Redis selection session, not a credential. Provider access tokens, the OAuth code, raw OAuth state and encrypted credential material are never placed in the frontend return URL.

If the user denies Meta authorization, the API consumes the one-time OAuth state and returns a normalized `metaConnectionStatus=denied` redirect without copying Meta's provider error description into the browser URL.

The frontend then uses its normal Supabase bearer session to retrieve selection metadata from the authenticated API endpoint. Only `OWNER` and `ADMIN` can access that endpoint, and the Redis selection session must belong to the same RecruitOps user.

## State and temporary session security

OAuth state is API-generated from 32 cryptographically random bytes. The raw state value is sent only through the authorization redirect; Redis stores only `SHA-256(state)` as the key, bound to the initiating RecruitOps user ID and requested targets.

State records expire after 10 minutes and are consumed with Redis `GETDEL`, making callback validation atomic and one-time. An expired, unknown or replayed state fails before RecruitOps contacts Meta.

After a successful callback, RecruitOps creates a separate 15-minute selection session. The long-lived Meta user token is encrypted with the same AES-256-GCM keyring used by the durable OAuth credential boundary before it is written to Redis. Page access tokens returned during discovery are not persisted in the temporary session; they are rediscovered when the operator confirms which account destinations to connect.

The selection session is bound to the initiating user and contains only:

- requested targets;
- encrypted Meta user-token envelope;
- non-secret Page / Instagram Professional metadata;
- creation and expiration timestamps.

The authenticated selection endpoints accept only `OWNER` or `ADMIN` callers. A submitted account must match both the originally requested target and an account discovered in that user's temporary session. Before durable promotion, RecruitOps re-discovers the selected account from Meta so a removed Page or changed Instagram linkage fails closed rather than persisting stale credentials.

The temporary selection session is deleted only after durable promotion succeeds. Provider or database failures leave the short-lived session available for a bounded retry until its TTL expires.

## Frontend account picker

The browser UI follows the same explicit-choice boundary as the backend:

1. the operator selects Facebook, Instagram, or both before authorization;
2. RecruitOps redirects to Meta's official authorization URL;
3. after the fixed callback return, the UI retrieves non-secret selection metadata using the authenticated RecruitOps session;
4. no account is preselected automatically;
5. Facebook Pages and linked Instagram Professional accounts are presented separately;
6. the operator checks the exact destinations to promote and confirms;
7. success removes the temporary callback query parameters from browser history state.

The picker is localized in Vietnamese and English, uses semantic `fieldset`/`legend` grouping, native keyboard-accessible checkboxes, visible error/status regions and reduced-motion handling for its loading indicator.

## Durable credential promotion

For Facebook, RecruitOps persists the freshly rediscovered Page access token for the selected Page. For an Instagram Professional account reached through the Facebook Login flow, RecruitOps persists the access token of the Facebook Page linked to that Instagram account for the Instagram social-account credential boundary.

Tokens are encrypted before persistence and are never included in the account-selection response. Promotion writes are transactionally grouped:

- create or update `SocialAccount`;
- create or update its encrypted `SocialCredential`;
- create or update the matching API-enabled `Destination`.

Existing accounts and destinations are updated instead of duplicated, making reconnect/promotion safe to repeat at the database boundary.

## Logging boundary

HTTP and authentication/authorization audit logging records request paths only. Query strings are stripped before logging so OAuth callback `code` and `state` values cannot enter the current Render/stdout log path.

The callback returns `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Authenticated start/selection responses also use `Cache-Control: no-store`.

## Provider boundary

`@recruitops/integrations` never persists credentials and never logs provider response bodies. The Meta app secret is used only server-side during token exchange. Resource requests use bearer authorization headers so access tokens are not placed in RecruitOps-generated Graph API query strings.

The API version is explicit configuration (`META_GRAPH_API_VERSION`) rather than silently hard-coded into product logic. The provider callback URI is explicit configuration (`META_REDIRECT_URI`) and must match the Meta app configuration exactly. The browser return destination is separately configured as `META_FRONTEND_REDIRECT_URI` and is never accepted from request input.

## Current product boundary

The provider boundary, one-time OAuth state, encrypted discovery session, fixed frontend handoff, localized account picker, authenticated explicit account promotion and encrypted durable credential promotion are implemented in code.

This does **not** make the integration production-active. The current hosted services still require Meta configuration, hosted credential migration/key provisioning and a real-provider integration/E2E verification pass before the Master Plan item can be checked.

## Production activation still required

1. approved Meta app configuration and exact provider callback URI;
2. App Review / advanced access where Meta requires it for non-role users;
3. runtime `META_CLIENT_ID`, `META_CLIENT_SECRET`, `META_GRAPH_API_VERSION`, `META_REDIRECT_URI` and `META_FRONTEND_REDIRECT_URI` values on the hosted API;
4. production OAuth encryption key provisioning;
5. hosted `social_credentials` migration execution;
6. integration/E2E verification against the configured Meta app and hosted frontend/API.

`META_FRONTEND_REDIRECT_URI` is declared as `sync: false` in `render.yaml`, but Render does not populate a newly added `sync: false` value automatically on an already-created service. It must therefore be configured explicitly in the existing API service environment before live verification.

Until those activation checks are complete, the Master Plan Meta connection item remains unchecked.
