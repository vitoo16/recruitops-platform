# ADR 0007 — Encrypt OAuth provider credentials in the application layer

## Status

Accepted.

## Context

RecruitOps needs to retain provider access/refresh credentials for supported social-account integrations. Those credentials are high-impact server secrets and cannot be stored in plaintext, exposed to browser clients, written into logs, or coupled directly to a single provider SDK.

The project already treats NestJS as the system-of-record boundary and PostgreSQL as durable domain storage. Provider-specific OAuth flows and scopes are intentionally separate work because they must be verified against current official provider documentation.

## Decision

- Encrypt provider credential payloads in the trusted API process before PostgreSQL persistence.
- Use AES-256-GCM authenticated encryption with a fresh 96-bit IV for every encryption operation.
- Store only the encryption envelope: provider platform, key ID, algorithm identifier, IV, authentication tag and ciphertext.
- Bind envelope version, platform and key ID as additional authenticated data.
- Keep encryption keys in runtime secret storage, never in PostgreSQL or source control.
- Use a keyring with one active write key and retained read keys so rotation can occur without immediately invalidating existing credentials.
- Keep `SocialAccount.credentialRef` as an opaque relation to `SocialCredential`; never place token material in shared/public contracts.
- Keep `social_credentials` API-owned. Enable RLS and deny browser roles direct table access.
- Fail closed on unknown keys, malformed envelopes or authentication failures and return sanitized error codes rather than cryptographic internals.

## Consequences

- A database-only compromise does not directly reveal provider tokens without the separate runtime encryption key.
- Runtime key compromise still requires provider-token revocation and encryption-key rotation; encryption does not replace provider-side revocation.
- Key rotation requires old keys to remain available until affected records are re-encrypted or revoked.
- Provider OAuth adapters can share one credential-storage boundary without leaking vendor SDK details into domain logic.
- Production activation requires the hosted migration plus server-side key provisioning; committing this ADR and implementation does not authorize or perform those production mutations.
