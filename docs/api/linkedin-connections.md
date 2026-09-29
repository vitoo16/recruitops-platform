# LinkedIn Connection API

Base path: `/api/integrations/linkedin/oauth`

All authenticated endpoints use the RecruitOps bearer session token. Provider credentials are never returned.

## `POST /start`

Authorization: `OWNER`, `ADMIN`.

Creates a one-time OAuth state and returns the official LinkedIn authorization URL plus the state expiry timestamp. The browser redirects to the returned URL.

## `GET /callback`

Public provider callback protected by the one-time OAuth state.

RecruitOps exchanges the authorization code server-side, loads the authorized OIDC member profile, encrypts the access token, promotes the member account/destination transactionally, and then redirects to the configured frontend return URL with only a connection status marker.

Provider tokens, authorization codes, client secrets and raw provider error bodies are never copied into the frontend redirect.

## `GET /accounts`

Authorization: `OWNER`, `ADMIN`.

Returns non-secret connected-account metadata:

- RecruitOps SocialAccount ID;
- stored LinkedIn OIDC subject;
- display name;
- connection status;
- granted scopes;
- credential expiry timestamp.

The endpoint uses `Cache-Control: no-store`.

## Current capability boundary

The connection API establishes a member credential with `openid profile w_member_social`. It does not claim organization posting access and does not expose a credential-refresh endpoint. Expired or revoked credentials are recovered through reconnect.

LinkedIn publishing remains a separate adapter/runtime task because the Posts API requires a verified Person author URN; RecruitOps does not infer that URN from the OIDC `sub` claim.
