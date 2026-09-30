# Integrations Package

Platform implementations live here behind vendor-neutral contracts from `@recruitops/contracts`.

## Current implementations

### Manual Assist

`DefaultManualDistributionProvider` prepares a human-in-the-loop distribution instruction for a saved Destination configured with `postingMode=MANUAL`.

It:
- resolves the saved Destination;
- rejects disabled, API-mode, or platform-mismatched destinations;
- composes copyable post text from content, hashtags, and optional link;
- emits stable checklist codes rather than hard-coded localized UI text;
- includes an attach-media step only when media is present;
- never clicks a browser, scrapes a session, or calls a private provider endpoint.

The frontend must translate checklist codes through project i18n before rendering them to users.

### Facebook Page publishing

`FacebookPagePublisher` implements the shared `SocialPublisher` boundary for the currently verified Page text/link publishing slice.

It:
- requires a Facebook publishing context resolved server-side;
- uses the selected Page external ID and protected Page access token supplied by the resolver;
- sends the provider token only in the bearer authorization header;
- publishes text/hashtags plus an optional link through the versioned Graph API Page feed edge;
- normalizes provider/network failures without copying provider response bodies;
- rejects media IDs for now instead of pretending private RecruitOps media can be published safely.

Facebook media publishing remains a later capability slice because the current RecruitOps media store is private and that provider path has not been added to this adapter yet.

### Instagram Professional publishing

`InstagramProfessionalPublisher` implements the shared `SocialPublisher` boundary for one-image or one-Reel publishing through Instagram API with Facebook Login.

It:
- requires exactly one media ID in the current slice;
- receives an HTTPS provider-fetchable media URL from an injected server-side media resolver;
- never converts the private RecruitOps bucket into public storage;
- creates an Instagram media container;
- polls Reel containers until provider status is `FINISHED` with bounded attempts;
- publishes the ready container through `media_publish`;
- returns the final Instagram media ID plus the creation container ID as normalized publish metadata.

The media resolver is intentionally outside the provider adapter. A future execution layer can issue a short-lived signed URL for a private object without exposing storage credentials or changing bucket visibility.

### LinkedIn member publishing

`LinkedInMemberPublisher` implements the shared `SocialPublisher` boundary for the currently supported member text/hashtag/link slice.

It:
- requires a server-side member context with `w_member_social` and an encrypted access token;
- derives the member Person URN from the connected member identifier only at execution time;
- calls the current LinkedIn Posts API at `POST /rest/posts` with `X-Restli-Protocol-Version: 2.0.0` and an explicit `Linkedin-Version` in `YYYYMM` format;
- publishes public member commentary composed from RecruitOps text, hashtags and an optional link;
- reads the created post URN only from LinkedIn's `x-restli-id` response header;
- rejects media IDs rather than silently dropping content or pretending upload support exists;
- remains disabled in the worker unless `PUBLISHING_LINKEDIN_ENABLED=true` and `LINKEDIN_API_VERSION` is valid.

Organization posting and LinkedIn media upload are intentionally not claimed by this slice. They require separately verified product permissions, organization-role checks and provider upload flows.

The current adapters return normalized `UNKNOWN` for generic post-status reconciliation because provider reconciliation has not yet been wired to a persisted credential context. They do not fabricate status certainty.

## Provider adapter boundary

`@recruitops/contracts` defines:
- `SocialPublisher`
- `ManualDistributionProvider`
- normalized publish commands/results/statuses
- `SocialAccount` and `Destination` contracts

Provider adapters in this package implement those contracts instead of leaking provider SDK types into domain/application code.

## Rules

- No undocumented/private provider endpoints.
- No browser/session scraping to bypass platform permissions.
- A provider adapter owns provider-specific validation and error translation.
- Business services consume normalized contracts only.
- OAuth tokens must never be represented by the shared `SocialAccount` response schema.
- `credentialRef` in persistence is a reference to protected credential material, never a plaintext token.
- Provider tokens belong in authorization headers, not logs or callback/browser state.
- Private media remains private; provider adapters accept only explicitly resolved, short-lived provider-fetchable media URLs where the official API requires URL ingestion.
- Unsupported official operations use `ManualDistributionProvider` rather than fake automation.
