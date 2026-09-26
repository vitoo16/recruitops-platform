# Social Integration Architecture

## Policy

Use documented, authorized APIs only.

```text
Domain
  ↓
Vendor-neutral interface
  ↓
Platform adapter
  ↓
Official API
```

Candidate interfaces:
- `SocialPublisher`
- `SocialAccountProvider`
- `MediaPublisher`
- `WebhookProvider`
- `ManualDistributionProvider`

## Platform behavior

- Facebook Pages: official supported operations only.
- Facebook Groups: do not assume arbitrary auto-posting; use Manual Assist when unsupported.
- Instagram: official supported professional publishing flows only.
- Threads: official Threads API only.
- LinkedIn: official member/organization scopes and posting API.
- TikTok: official Content Posting flows and current app/audit requirements.
- Zalo: supported OA/OpenAPI capabilities only.

Every implementation must re-check current official provider documentation before coding.
