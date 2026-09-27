# Meta Connection Picker UX

## Purpose

The Meta connection workspace lets an authenticated RecruitOps operator authorize Meta and explicitly choose which discovered Facebook Pages and linked Instagram Professional accounts become API publishing destinations.

The UI must never auto-connect every account returned by Meta.

## Authorization

- `OWNER` and `ADMIN` may start Meta authorization, view the temporary selection session and confirm account promotion.
- `RECRUITER` and `VIEWER` see the integration as unavailable for their role.
- the browser uses the existing Supabase session bearer token for RecruitOps API calls;
- Meta provider access tokens are never returned to the browser.

## Interaction flow

1. Select Facebook, Instagram, or both.
2. Choose **Continue with Meta**.
3. RecruitOps starts the server-side OAuth session and redirects the browser to Meta.
4. Meta redirects to the RecruitOps API callback.
5. The API finishes provider discovery and returns `303` to the configured frontend URL with a short-lived connection-session UUID only.
6. The signed-in UI loads non-secret account metadata from the authenticated selection endpoint.
7. The operator checks the exact Pages / Instagram Professional accounts to connect.
8. The UI submits only those explicit selections to the promotion endpoint.
9. On success, callback query parameters are removed from browser history state.

## Account presentation

Each discovered Facebook Page is displayed as one group. When Facebook was authorized, the Page can be selected as a Facebook API destination. When Instagram was authorized and the Page has a linked Instagram Professional account, that account is displayed as a separate selectable destination.

If Instagram was requested but a Page does not have a linked Professional account, the UI explains that no eligible Instagram account is linked instead of fabricating or inferring one.

No discovered account is selected by default.

## Error and retry behavior

- cancelled Meta consent returns a normalized message and connects nothing;
- expired or unavailable selection sessions instruct the operator to restart authorization;
- a failed promotion keeps the server-side temporary session retryable until its bounded TTL expires;
- errors are localized and do not surface raw provider response bodies or provider tokens.

## Accessibility and localization

- Vietnamese and English copy are provided through `next-intl`;
- target and account groups use semantic `fieldset` / `legend` elements;
- account choices use native keyboard-accessible checkboxes;
- errors use `role="alert"` and status messages use `role="status"`;
- loading feedback uses `aria-live`;
- spinner motion respects `prefers-reduced-motion` through `motion-reduce:animate-none`;
- the integration does not rely on color alone to communicate selection or failure state.

## Production boundary

The UI code does not imply that hosted Meta integration is active. Production still requires the Meta app/runtime values, hosted credential migration and encryption-key provisioning, and a real-provider integration/E2E verification pass.
