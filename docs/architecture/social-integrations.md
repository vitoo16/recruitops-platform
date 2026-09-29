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
- LinkedIn: current member connection uses documented 3-legged OAuth with `openid profile w_member_social`; organization posting remains separately gated by organization scopes/roles/product access, and member publishing must verify the Posts API Person author identity rather than equating OIDC `sub` with a Person ID.
- TikTok: official Content Posting flows and current app/audit requirements.
- Zalo: supported OA/OpenAPI capabilities only.

Every implementation must re-check current official provider documentation before coding.
