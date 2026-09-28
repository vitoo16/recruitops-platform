# Secrets Management & Deployment Rules

## Goal

RecruitOps must keep credentials out of source control, browser bundles, logs, screenshots, issue/PR text and ordinary workflow data. Deployment providers own runtime secret injection; the repository owns only names, schemas, placeholders and non-sensitive public configuration.

## Classification

### Public configuration

These values may be exposed to browser code when explicitly intended for public clients:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

A Supabase publishable key is not a service-role secret. Its privileges still depend on Supabase Auth/RLS and backend authorization; it must never be treated as an admin credential.

### Server-only secrets

Examples include:

- database connection URLs containing credentials;
- Redis credential-bearing connection URLs;
- Supabase secret/service-role keys, including `SUPABASE_SECRET_KEY` used by the provider-media worker boundary;
- S3 access key IDs and secret access keys;
- OAuth client secrets and refresh/access tokens;
- OAuth credential-encryption keys;
- TikTok, Meta, LinkedIn and Zalo client secrets;
- n8n shared secrets and credentials;
- QStash signing keys/tokens;
- application signing/encryption secrets.

Server-only values must never use a `NEXT_PUBLIC_` prefix.

## Repository rules

1. Do not commit runtime `.env`, `.env.local`, `.env.production`, credential exports, private keys or token files.
2. Commit only `.env.example` / `.env.sample` templates with blank, placeholder or intentionally local-development values.
3. Never place a real secret in Markdown, Mermaid, code comments, fixtures, tests, issue templates or screenshots.
4. Never log bearer tokens, OAuth tokens, cookies, passwords, S3 secrets or credential-bearing connection strings.
5. If a credential is accidentally committed, remove it from active code **and rotate/revoke it**. Git history cleanup alone does not make a leaked credential safe again.
6. Never pass secrets through browser-visible environment variables, static build output or client-side error messages.
7. Prefer least-privilege credentials scoped to one provider/resource/environment.
8. Separate development and production credentials.
9. Do not reuse `AUTH_SECRET` or provider client secrets as OAuth credential-encryption keys.

## OAuth credential storage

Provider access/refresh tokens are encrypted in the API before PostgreSQL persistence. The database stores only an authenticated-encryption envelope:

- provider platform;
- encryption key ID;
- algorithm identifier;
- nonce/IV;
- authentication tag;
- ciphertext.

The current implementation uses AES-256-GCM with a fresh 96-bit IV for each encryption. Additional authenticated data binds the envelope format, provider platform and key ID so those values cannot be silently swapped without decryption failing.

Runtime key configuration is server-only:

```text
OAUTH_CREDENTIAL_ACTIVE_KEY_ID=<active-key-id>
OAUTH_CREDENTIAL_ENCRYPTION_KEYS=<JSON object of key-id to 32-byte base64 key>
```

The keyring may retain previous keys for decryption while new writes use only the active key. Never delete an old key until every credential encrypted with that key has been re-encrypted or revoked.

The `social_credentials` table is API-owned. Browser roles receive no direct policy and the hosted migration explicitly revokes `anon`/`authenticated` table access. `SocialAccount.credentialRef` stores only the credential record identifier; it is never a token.

Provider-specific OAuth code must use the server-side credential store rather than persisting or returning raw tokens through public/shared contracts.

## Provider-readable private media

Instagram and Threads provider ingestion requires an HTTPS URL their servers can fetch. RecruitOps keeps the canonical bucket private and creates a short-lived signed URL only inside the publishing worker after the publication projection has already supplied explicit MediaAsset UUIDs.

The resolver boundary must:

- load only the requested `MediaAsset` records from PostgreSQL;
- accept publishable media kinds only (`IMAGE` / `VIDEO`);
- preserve the explicit PostVariant media order;
- use a server-only Supabase secret key to create the signed URL;
- reject URLs that do not resolve to the configured HTTPS Supabase origin;
- keep signed URLs in memory only for the immediate provider request;
- never persist or log the signed URL, its token/query string, the private `storageKey`, or the Supabase secret key.

Signed URLs are bearer capabilities and remain valid until their configured expiry. `PROVIDER_MEDIA_SIGNED_URL_TTL_SECONDS` is therefore bounded and should remain as short as provider ingestion reliably permits. The current worker default is 900 seconds.

The worker accepts the modern `sb_secret_...` key form through `SUPABASE_SECRET_KEY`. It intentionally does not accept a browser publishable key. Production secret injection remains a deployment action and is not authorized by committing this code.

## Deployment rules

### Render

- Configure secret values through Render environment variables/secret controls, never `render.yaml` literal values.
- `render.yaml` may define variable names using `sync: false` or provider-generated values.
- Public frontend build variables must be intentionally reviewed because static-site build-time values become browser-visible.
- Credential-bearing `DATABASE_URL` and `REDIS_URL` remain server-only API/worker variables.
- OAuth encryption keyring values must be configured only on trusted server/worker runtimes that need to decrypt provider credentials.
- `SUPABASE_SECRET_KEY` may be configured only on the publishing worker/runtime that needs to sign provider-readable media URLs; it must not be injected into the static frontend.

### Supabase

- Browser: project URL + publishable key only.
- Backend privileged operations: use a server-side secret/service-role credential only when the feature explicitly requires it and least privilege cannot be achieved otherwise.
- Never expose a service-role/secret key in `NEXT_PUBLIC_*` configuration.
- Candidate/CV access must not rely on obscurity of bucket URLs; authorization must be enforced.
- `social_credentials` remains API-owned and must not receive browser-facing Data API grants/policies.
- Provider-media signing must keep the bucket private; temporary signed URLs are generated server-side and are not stored as application data.

### n8n

- Store credentials in the n8n credential system.
- Do not place passwords/tokens in ordinary workflow text fields, expressions, exported workflow JSON or repository documentation.
- Webhook/shared secrets must be injected through runtime credentials/environment configuration.

## CI enforcement

`pnpm secrets:check` runs `tooling/scripts/check-secrets.mjs` and is part of the required CI gate.

The guardrail currently rejects:

- tracked runtime `.env*` files except explicit example/sample templates;
- high-confidence Supabase secret keys;
- GitHub PAT formats;
- private-key material;
- AWS access key IDs;
- Slack token formats;
- sensitive-looking `NEXT_PUBLIC_*` variable names such as passwords, service-role keys, private keys or access/refresh tokens.

This check is defense-in-depth, not a guarantee that every possible credential format is detectable. Human review and provider-side credential hygiene remain mandatory.

## Rotation / incident response

If a secret may have been exposed:

1. revoke or rotate the credential at the provider immediately;
2. update the authorized runtime secret store;
3. if an OAuth encryption key is rotated, add the replacement key under a new key ID and make it active before removing the previous key;
4. re-encrypt or revoke records that still reference a retiring key before removing that key from the runtime keyring;
5. verify affected services reconnect correctly;
6. inspect logs/audit events for suspicious use;
7. remove the exposed value from current source and, where appropriate, repository history;
8. document the incident without reproducing the credential value.

## Review checklist

Before merging a change that touches credentials or integrations:

- [ ] no real secret is present in the diff;
- [ ] browser-visible variables contain only public configuration;
- [ ] least-privilege scope is used;
- [ ] OAuth token material is encrypted before persistence;
- [ ] encryption keys exist only in authorized runtime secret storage;
- [ ] provider-media signing URLs and tokens are not persisted/logged;
- [ ] logs/errors do not reveal the credential;
- [ ] rotation/revocation procedure is understood;
- [ ] `pnpm secrets:check` passes.
