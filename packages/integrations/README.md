# Integrations Package

Platform implementations belong here, behind vendor-neutral contracts from `@recruitops/contracts`.

## Current contract boundary

`@recruitops/contracts` defines:
- `SocialPublisher`
- `ManualDistributionProvider`
- normalized publish commands/results/statuses
- `SocialAccount` and `Destination` contracts

Future provider adapters in this package must implement those contracts instead of leaking provider SDK types into domain/application code.

## Rules

- No undocumented/private provider endpoints.
- No browser/session scraping to bypass platform permissions.
- A provider adapter owns provider-specific validation and error translation.
- Business services consume normalized contracts only.
- OAuth tokens must never be represented by the shared `SocialAccount` response schema.
- `credentialRef` in persistence is a reference to protected credential material, never a plaintext token.
- Unsupported official operations use `ManualDistributionProvider` rather than fake automation.
