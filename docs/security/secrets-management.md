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
- Supabase secret/service-role keys;
- S3 access key IDs and secret access keys;
- OAuth client secrets and refresh/access tokens;
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

## Deployment rules

### Render

- Configure secret values through Render environment variables/secret controls, never `render.yaml` literal values.
- `render.yaml` may define variable names using `sync: false` or provider-generated values.
- Public frontend build variables must be intentionally reviewed because static-site build-time values become browser-visible.
- Credential-bearing `DATABASE_URL` and `REDIS_URL` remain server-only API/worker variables.

### Supabase

- Browser: project URL + publishable key only.
- Backend privileged operations: use a server-side secret/service-role credential only when the feature explicitly requires it and least privilege cannot be achieved otherwise.
- Never expose a service-role/secret key in `NEXT_PUBLIC_*` configuration.
- Candidate/CV access must not rely on obscurity of bucket URLs; authorization must be enforced.

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
3. verify affected services reconnect correctly;
4. inspect logs/audit events for suspicious use;
5. remove the exposed value from current source and, where appropriate, repository history;
6. document the incident without reproducing the credential value.

## Review checklist

Before merging a change that touches credentials or integrations:

- [ ] no real secret is present in the diff;
- [ ] browser-visible variables contain only public configuration;
- [ ] least-privilege scope is used;
- [ ] secret value is stored in the provider credential store;
- [ ] logs/errors do not reveal the credential;
- [ ] rotation/revocation procedure is understood;
- [ ] `pnpm secrets:check` passes.
