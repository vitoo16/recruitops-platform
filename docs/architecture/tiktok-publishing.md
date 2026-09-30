# TikTok publishing boundary

## Current provider contract

RecruitOps uses TikTok's official Content Posting API Direct Post flow for the code-side publishing foundation:

1. `POST /v2/post/publish/creator_info/query/` with the connected user's `video.publish` token.
2. Render/use only the current privacy and interaction options returned for that creator.
3. After explicit user consent, initialize video Direct Post with `POST /v2/post/publish/video/init/`.
4. Use `FILE_UPLOAD` for RecruitOps private media rather than handing a private Supabase signed URL to TikTok's `PULL_FROM_URL` boundary.
5. Upload the binary media to the provider-issued `upload_url` with the required content range headers.
6. Track asynchronous completion with `POST /v2/post/publish/status/fetch/`.

The provider foundation lives in `packages/integrations/src/tiktok-publishing.ts`. It validates provider envelopes, keeps access tokens in bearer headers, validates provider upload URLs, restricts video MIME types to the official upload types, and normalizes async status without copying provider error messages into application errors.

## Why runtime activation is still fail-closed

This foundation is deliberately **not** registered in the production worker yet. TikTok's current Direct Post rules require the app to query the creator's latest info, display the returned privacy/interaction options, and collect explicit user consent before initializing a post. RecruitOps currently has generic PostVariant metadata but no TikTok-specific creator-options/consent UI wired into publish-now or scheduling.

Registering the adapter before that UI/API boundary exists would allow the worker to publish with guessed or stale privacy settings, which would violate the provider flow. The next code-side slice must therefore expose creator-info through the authenticated API, persist/validate the user's chosen TikTok posting settings, and propagate them into the durable PostVariant metadata consumed by the worker.

## Media-transfer boundary

RecruitOps private media is stored behind Supabase authorization. TikTok's `PULL_FROM_URL` mode requires a publicly reachable URL from a domain or URL prefix verified for the application, so the current short-lived private Supabase signed URL is not treated as a valid Direct Post pull source.

The intended runtime path is server-side `FILE_UPLOAD`. Before production wiring, the worker needs a bounded media-byte streaming/downloading boundary with MIME/size validation and chunking that follows TikTok's current transfer limits. The provider foundation exposes upload-chunk primitives but does not buffer arbitrary private videos into worker memory by itself.

## Live-provider boundary

Even after repository wiring is complete, production activation remains gated on TikTok app/product access, `video.publish` approval, Content Posting API audit, hosted credentials, durable token refresh, and a real-provider integration/E2E pass. Unaudited Direct Post clients remain subject to TikTok's private-viewing restriction.
