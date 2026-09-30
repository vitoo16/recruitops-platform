# Content Security Policy

RecruitOps serves the web application as a Render Static Site. The production CSP is therefore defined as a Render response header in the repository-owned `render.yaml` rather than in Next.js runtime middleware.

## Enforced baseline

The static-site policy is designed around the currently documented production origins:

- application assets: same origin;
- API calls: `https://recruitops-api.onrender.com`;
- Supabase Auth/Storage: `https://ybkmijhhhuqzatpnigsq.supabase.co`;
- optional browser error delivery: Sentry ingest subdomains;
- image/video object previews: same origin, `blob:`, and the production Supabase origin.

The policy denies plugins and framing, restricts `<base>` and form destinations, and upgrades insecure requests. `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and the existing referrer policy remain as defense-in-depth headers.

## Inline-script/style boundary

The current Next.js static export emits framework/bootstrap inline content, so this baseline retains `'unsafe-inline'` for `script-src` and `style-src`. This is intentionally documented as a limitation rather than presented as a nonce/hash-based strict CSP.

A future hardening slice may remove those allowances only after the generated production HTML is verified to work with nonce/hash-based controls. Do not add `'unsafe-eval'`.

## Change-control rule

Any production origin added for API, Supabase, browser monitoring, media, fonts, frames, or other browser-fetched resources must be reviewed against the minimum relevant directive. Do not broaden `default-src` or replace specific allowlists with `https:`/`*` merely to suppress CSP violations.

## Verification

Repository CI can validate YAML formatting and application regressions, but it cannot prove that Render has deployed the header. Before the production-readiness CSP blocker is closed:

1. deploy/sync the final Blueprint to the intended production Static Site;
2. fetch the deployed frontend response and confirm the expected `Content-Security-Policy` header;
3. exercise authentication, API access, Supabase upload/download/media preview, OAuth navigation, and optional browser monitoring;
4. inspect browser CSP violations and tighten or minimally extend individual directives from observed legitimate traffic;
5. keep the production-readiness review at **NOT READY** until hosted verification is evidenced.

The CSP is a defense-in-depth control and does not replace output encoding, safe React rendering, server-side authorization, upload validation, or secret-management rules.
