# TikTok Connection API

Base path: `/api/integrations/tiktok/oauth`.

## `POST /start`

OWNER/ADMIN only. Creates one-time anti-forgery state and returns the official TikTok authorization URL plus state expiry. Response is `Cache-Control: no-store`.

## `GET /callback`

Public provider callback protected by one-time state. RecruitOps exchanges the code server-side, validates required granted scopes, verifies token `open_id` against current user info, encrypts access/refresh credentials, promotes the TikTok SocialAccount + API PROFILE Destination transactionally, then redirects to the fixed frontend return URL with status only.

## `GET /accounts`

OWNER/ADMIN only. Returns non-secret TikTok account metadata: RecruitOps account ID, TikTok open ID, display name, status, scopes and access-token expiry.

## Current boundary

The connection requests `user.info.basic,video.publish`. It does not expose raw provider tokens and does not implement the Content Posting API runtime in this slice. The lower-level TikTok provider includes the documented refresh-token exchange; durable lifecycle refresh orchestration remains separate.
