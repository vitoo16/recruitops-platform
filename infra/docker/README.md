# Local Infrastructure

The local development stack intentionally mirrors production capabilities without requiring paid services.

## Services

- PostgreSQL 17 on `localhost:5432`
- Redis 7.4 on `localhost:6379`
- MinIO S3-compatible API on `http://localhost:9000`
- MinIO console on `http://localhost:9001`
- private bucket `recruitops-private`, created by the one-shot `minio-init` service

MinIO is a local-development substitute for the S3-compatible object-storage boundary. Hosted development/production continues to use the private Supabase Storage bucket.

## Start

```bash
pnpm infra:up
```

`infra:up` first runs `pnpm infra:setup`, which creates ignored local env files with random MinIO and application secrets. Existing env files are never overwritten.

## Stop

```bash
pnpm infra:down
```

## Security

- `infra/docker/.env.local`, root `.env`, and `apps/web/.env.local` are ignored by Git.
- The generated MinIO password and auth secret are local-only.
- The bucket is explicitly configured as private; no anonymous access is granted.
- Never reuse generated local credentials in Render, Supabase, or other hosted environments.

## Provider parity

Application code must depend on an S3-compatible storage adapter, not MinIO- or Supabase-specific business logic. This keeps local MinIO and hosted Supabase Storage interchangeable behind the same storage contract.
