# TikTok Creator Connection

## Current official boundary

RecruitOps uses TikTok Login Kit for Web and the current v2 user access-token management APIs. Official TikTok documentation was rechecked on 2026-09-30 before implementation.

The code-side connection requests only `user.info.basic` and `video.publish`: basic profile identity is required to promote a stable creator account, while `video.publish` is the permission required for Direct Post. `video.upload` is intentionally not requested because that permission represents the separate draft-to-inbox workflow.

Authorization uses `https://www.tiktok.com/v2/auth/authorize/`. Authorization codes are exchanged server-side at `https://open.tiktokapis.com/v2/oauth/token/`. Basic creator identity is loaded from `GET https://open.tiktokapis.com/v2/user/info/` and the token `open_id` must match the user-info `open_id` before RecruitOps promotes the connection.

## Security and lifecycle

Only authenticated OWNER and ADMIN users may start authorization or list connected accounts. A 32-byte cryptographically random state is generated per attempt. Redis stores only `SHA-256(state)` with the initiating RecruitOps user ID for ten minutes and consumes it atomically using `GETDEL`.

TikTok returns both an access token and refresh token. RecruitOps encrypts both with the existing AES-256-GCM OAuth credential keyring before persistence. The access-token expiry and refresh-token expiry are also retained inside the encrypted payload. Tokens, client secrets, authorization codes and raw provider response bodies are never returned to the browser.

The provider adapter includes the documented refresh-token operation and accepts TikTok's rotated refresh token. A dedicated account lifecycle command/UI for refreshing stored credentials remains a separate slice; reconnect is already safe because account, credential and API PROFILE Destination promotion is transactional and keyed by TikTok `open_id`.

## Publishing gate

TikTok Direct Post requires Content Posting API access and approval/authorization of `video.publish`. Direct posting also requires the product UX to query current creator info immediately before posting and honor the returned privacy/interactions settings. Unaudited clients are subject to TikTok's visibility restrictions.

This connection slice therefore does not claim the TikTok publishing adapter is complete. The later adapter/runtime slice must implement creator-info querying, user-selected privacy/options, supported media transfer, post initialization/status polling, rate limits and audit restrictions according to current official documentation.

## Production gate

No real TikTok client key/secret or user token is committed. Hosted redirect configuration, TikTok app approval, `video.publish` approval, Content Posting API audit, real OAuth, token refresh and real-provider E2E remain production gates.
