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

## Provider adapter boundary

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
