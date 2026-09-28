# OAuth Credential Runtime Boundary

## Purpose

RecruitOps uses one provider-neutral AES-256-GCM credential envelope for OAuth credentials across the API and publication worker runtimes.

The canonical cipher now lives in `@recruitops/integrations`. The NestJS API keeps a thin injectable wrapper so existing dependency-injection boundaries remain stable, while worker code imports the same implementation directly. This prevents API and worker runtimes from drifting into incompatible credential formats.

## Keyring contract

Runtime configuration remains environment-only:

- `OAUTH_CREDENTIAL_ACTIVE_KEY_ID` identifies the key used for new writes;
- `OAUTH_CREDENTIAL_ENCRYPTION_KEYS` is a JSON object mapping key IDs to base64-encoded 32-byte AES keys;
- up to eight keys may be retained to support controlled rotation;
- the active key must exist in the keyring;
- keys, tokens and decrypted payloads must never be logged.

Each encryption operation uses a fresh 12-byte IV and AES-256-GCM authentication tag. Additional authenticated data binds the envelope to the RecruitOps credential format version, social platform and key ID.

## Worker credential resolver

`WorkerOAuthCredentialResolver` reads one SocialAccount and only the related encrypted SocialCredential fields required for decryption.

Before decryption it fails closed when:

- the account does not exist;
- the account platform differs from the publication platform;
- the account is not `CONNECTED`;
- the account-level expiry has passed;
- no credential relation exists;
- the credential platform differs from the publication platform.

After decryption it also rejects an expired credential payload. The resolver returns only the provider access token needed by a publishing adapter. Refresh tokens and encrypted envelope fields are not added to the publication executor contract.

## Security boundary

The publication execution repository intentionally does not select credential material. Credential lookup/decryption occurs only in the provider runtime resolver after the executor has validated the durable Publication, Destination and SocialAccount relationship.

Provider adapters must receive tokens server-side through their context resolver. Tokens must not appear in URLs, browser contracts, queue payloads, structured logs or persisted publication errors.

## Runtime activation still required

This slice does not start the production publication worker. Activation still requires:

- production publisher-registry wiring for enabled providers;
- explicit media-selection semantics and approved provider-readable media URL resolution;
- graceful Redis/Prisma worker startup and shutdown;
- integration/E2E verification against the real queue, database and provider boundaries.
