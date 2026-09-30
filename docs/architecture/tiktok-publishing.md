# TikTok publishing boundary

## Current provider contract

RecruitOps keeps a code-side TikTok Content Posting API foundation behind a fail-closed activation boundary:

1. `POST /v2/post/publish/creator_info/query/` with the connected user's `video.publish` token.
2. Render/use only the latest privacy and interaction options returned for that creator.
3. Collect the required metadata, commercial-content disclosure, and explicit user consent before initialization.
4. Initialize video Direct Post with `POST /v2/post/publish/video/init/` only after those conditions are satisfied.
5. Track asynchronous completion with `POST /v2/post/publish/status/fetch/`.

The provider foundation lives in `packages/integrations/src/tiktok-publishing.ts`. It validates provider envelopes, keeps access tokens in bearer headers, normalizes async status without copying provider error messages into application errors, and includes the current commercial disclosure fields (`brand_content_toggle`, `brand_organic_toggle`) plus optional AIGC disclosure.

## Authenticated creator-info boundary

The API exposes `POST /integrations/tiktok/oauth/accounts/:accountId/creator-info` to OWNER/ADMIN operators. The route is intentionally `no-store` and resolves the selected TikTok account server-side before calling the provider. It verifies connected status, account expiry, persisted `video.publish` scope, encrypted credential presence, decrypted credential scope and token expiry. The access token is decrypted only inside the API process and is never returned to the browser.

The response contains only the current creator capability values required for the posting UI: creator identity labels, provider-returned privacy options, interaction restrictions and maximum post duration. Provider failures are mapped to bounded application error codes without returning provider message bodies.

## Compliance blocker: current RecruitOps product use

The production TikTok Direct Post adapter remains intentionally disabled. TikTok's current developer guidelines state that Direct Post clients should support authentic creators and a broad audience and explicitly list an internal utility used to upload content to accounts managed by the developer or their team as an unacceptable intended use.

RecruitOps is currently designed as an internal recruiting/marketing operations tool for accounts managed by the operator team. Unless TikTok approves a product shape/use case that satisfies its current Content Posting API requirements, RecruitOps must not represent Direct Post as a production-supported capability.

This is an external product/compliance blocker, not a code defect. The existing foundation is retained for future compliant product scope or provider approval, but worker registration stays fail-closed.

## Required UX before any future activation

Even if the intended-use blocker is resolved, TikTok requires the application to query the latest creator info when rendering the posting UI and give users direct control over what is sent. A future compliant UI must at minimum:

- display the target creator nickname/account;
- present only the returned privacy options, with no preselected privacy default;
- disable interaction controls that creator info reports as unavailable and leave allowed interactions unchecked by default;
- validate the selected video's duration against `max_video_post_duration_sec`;
- provide editable title/caption fields;
- implement Commercial Content disclosure, including Your Brand / Branded Content rules and their privacy restrictions;
- show the required Music Usage Confirmation / Branded Content Policy declaration as applicable;
- collect express upload consent before sending media to TikTok;
- present a preview and asynchronous processing status.

RecruitOps does not yet implement that complete UX/snapshot boundary, so activation stays blocked independently of provider credentials.

## Media-transfer boundary

RecruitOps media already resides on server-side Supabase storage. TikTok's current technical guidance says server-side media should use `PULL_FROM_URL`, while `FILE_UPLOAD` is intended for media located on the user's device. `PULL_FROM_URL` requires the supplied media URL to be under a domain or URL prefix verified for the TikTok application.

The existing `FILE_UPLOAD` primitive is therefore not wired into the RecruitOps worker. Production Direct Post would first require a TikTok-approved product use case plus a provider-verified media delivery domain/prefix (or another provider-approved media architecture). A short-lived private Supabase signed URL is not assumed to satisfy that ownership-verification requirement.

## Live-provider boundary

Production activation remains gated on all of the following, even if repository implementation is otherwise complete:

- an intended product use accepted under TikTok's current Content Posting API guidelines;
- TikTok app/product access and `video.publish` approval;
- successful Content Posting API audit where required;
- provider-verified media delivery ownership suitable for server-side media;
- hosted credentials and durable refresh orchestration;
- the required posting UX/consent/disclosure workflow;
- real-provider integration/E2E verification.

Until those conditions are met, `Implement TikTok adapter for currently supported official capabilities` remains incomplete in `MASTER_PLAN.md`.
