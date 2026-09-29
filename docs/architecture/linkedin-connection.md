# LinkedIn Member Connection

## Scope

RecruitOps implements the current code-side LinkedIn **member** connection boundary through LinkedIn's documented 3-legged OAuth authorization-code flow.

Official LinkedIn documentation was rechecked on 2026-09-30 before implementation. The current member flow uses:

- authorization endpoint: `https://www.linkedin.com/oauth/v2/authorization`;
- token endpoint: `https://www.linkedin.com/oauth/v2/accessToken`;
- OIDC user information endpoint: `https://api.linkedin.com/v2/userinfo`;
- requested scopes: `openid profile w_member_social`.

`email` is intentionally not requested because RecruitOps does not need a LinkedIn email address for social publishing.

## Security boundary

Only authenticated `OWNER` and `ADMIN` users may start authorization or list connected LinkedIn accounts.

The authorization flow uses a cryptographically random 32-byte OAuth `state`. Redis stores only `SHA-256(state)` with the initiating RecruitOps user ID and a ten-minute TTL. The callback consumes the state atomically with `GETDEL`, so it cannot be replayed.

The OAuth callback is public because LinkedIn redirects the browser to it, but it is bounded by the one-time state. Responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The authorization code is exchanged server-side. The LinkedIn client secret and access token are never returned to the browser, written to redirect URLs, or copied into provider-facing error messages. The access token is encrypted with the existing AES-256-GCM OAuth credential keyring before durable storage.

## Member identity and durable promotion

After token exchange, RecruitOps calls LinkedIn's OIDC `userinfo` endpoint and stores the returned `sub` value as the external identity for the connected member account. The display name is taken from the OIDC `name` claim when present.

Promotion is transactional:

1. create or reconnect one `LINKEDIN` `SocialAccount` keyed by its stored external member identity;
2. create or replace its encrypted `SocialCredential`;
3. create or update one enabled API `PROFILE` Destination;
4. persist the granted scopes and token expiry.

Reconnect reuses the existing account/destination identity instead of manufacturing duplicates.

RecruitOps does **not** assume that the OIDC `sub` claim is interchangeable with the Person ID required by the LinkedIn Posts API. Official documentation describes Posts API authors as `urn:li:person:{id}`, while the OIDC profile endpoint documents the stable `sub` claim separately. The publishing adapter must therefore resolve or verify the required author identity through a documented LinkedIn capability before member posting is activated. If that identity cannot be established safely, publishing must fail closed rather than infer a Person URN.

## Scope verification and expiry

When LinkedIn returns a granted scope string, RecruitOps verifies that `openid`, `profile`, and `w_member_social` are all present before storing the credential. A narrower returned scope set fails closed.

The current self-service member connection path does not assume refresh-token availability. The access-token expiry returned by LinkedIn is persisted. Once the credential becomes expired/revoked/error, the supported recovery path is reconnect through the authorization-code flow.

## Organization capability boundary

This slice does not request or imply LinkedIn organization posting capability.

Organization posting requires separate LinkedIn access such as `w_organization_social`, eligible organization roles, and the corresponding approved LinkedIn product/API access. RecruitOps will only add organization destinations after those official requirements are verified for the actual application configuration.

## Production gate

The repository contains no real LinkedIn client secret or access token. Hosted `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, redirect configuration, LinkedIn product access, live callback verification, and real-provider integration/E2E remain production gates.

The code-side member connection path is intentionally useful without claiming those live-provider gates are complete.
