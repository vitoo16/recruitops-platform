# Meta Connection Picker UX

## Purpose

The Meta connection workspace lets an authenticated RecruitOps operator authorize Meta and explicitly choose which discovered Facebook Pages and linked Instagram Professional accounts become API publishing destinations.

The UI must never auto-connect every account returned by Meta.

## Authorization

- `OWNER` and `ADMIN` may start Meta authorization, view integration health, view the temporary selection session and confirm account promotion.
- `RECRUITER` and `VIEWER` see the integration as unavailable for their role.
- the browser uses the existing Supabase session bearer token for RecruitOps API calls;
- Meta provider access tokens are never returned to the browser.

## Integration health

The workspace loads `GET /integrations/health` after the API has verified an `OWNER` or `ADMIN` session. The response contains only non-secret connection metadata.

Meta is summarized as one of:

- `NOT_CONFIGURED`: Meta OAuth or OAuth credential-encryption runtime configuration is incomplete;
- `DISCONNECTED`: runtime configuration is complete but no Meta accounts are connected;
- `HEALTHY`: every connected Meta account has a durable credential and no known reconnect condition;
- `RECONNECT_REQUIRED`: at least one connected account is expired, revoked, in an integration error state, or missing its durable credential reference.

Per-account health exposes display name, platform, account status, optional credential expiry, and a normalized reconnect reason. Credential references, encrypted envelopes, OAuth tokens and provider response bodies are never browser-visible.

## Interaction flow

1. Select Facebook, Instagram, or both.
2. Choose **Continue with Meta**.
3. RecruitOps starts the server-side OAuth session and redirects the browser to Meta.
4. Meta redirects to the RecruitOps API callback.
5. The API finishes provider discovery and returns `303` to the configured frontend URL with a short-lived connection-session UUID only.
6. The signed-in UI loads non-secret account metadata from the authenticated selection endpoint.
7. The operator checks the exact Pages / Instagram Professional accounts to connect.
8. The UI submits only those explicit selections to the promotion endpoint.
9. On success, callback query parameters are removed from browser history state and integration health is refreshed.

## Reconnect flow

Accounts requiring intervention display a **Reconnect** action. The action starts the same official Meta OAuth flow for that account's platform; it does not silently reuse, refresh or promote a credential in the browser.

After authorization, the operator must again explicitly choose which discovered account is promoted. The existing server-side promotion path replaces the durable credential for an existing matching account instead of creating a duplicate.

Connection and reconnect actions are disabled when the health endpoint reports `NOT_CONFIGURED`, so a known-incomplete production runtime fails closed instead of sending the user into an OAuth flow that cannot finish safely.

## Account presentation

Each discovered Facebook Page is displayed as one group. When Facebook was authorized, the Page can be selected as a Facebook API destination. When Instagram was authorized and the Page has a linked Instagram Professional account, that account is displayed as a separate selectable destination.

If Instagram was requested but a Page does not have a linked Professional account, the UI explains that no eligible Instagram account is linked instead of fabricating or inferring one.

No discovered account is selected by default.

## Error and retry behavior

- cancelled Meta consent returns a normalized message and connects nothing;
- expired or unavailable selection sessions instruct the operator to restart authorization;
- a failed promotion keeps the server-side temporary session retryable until its bounded TTL expires;
- failed integration-health loading is shown separately from provider health state;
- errors are localized and do not surface raw provider response bodies or provider tokens.

## Accessibility and localization

- Vietnamese and English copy are provided through `next-intl`;
- target and account groups use semantic `fieldset` / `legend` elements;
- account choices use native keyboard-accessible checkboxes;
- reconnect controls are native buttons with textual labels;
- errors use `role="alert"` and status messages use `role="status"`;
- loading feedback uses `aria-live`;
- spinner motion respects `prefers-reduced-motion` through `motion-reduce:animate-none`;
- the integration does not rely on color alone to communicate selection or failure state.

## Production boundary

The health endpoint reports runtime readiness; it does not configure secrets or execute migrations. Production still requires the Meta app/runtime values, hosted credential migration and encryption-key provisioning, and a real-provider integration/E2E verification pass before the broader Meta connection implementation can be marked production-complete.
