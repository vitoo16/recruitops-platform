# Object Storage Architecture

## Decision

RecruitOps uses an S3-compatible storage boundary:

- **Local development:** MinIO in Docker Compose.
- **Hosted free environment:** private Supabase Storage bucket `recruitops-private`.
- **Future production:** any approved private S3-compatible provider can replace either implementation without changing candidate/media business logic.

## Required abstraction

Application/domain code must not call MinIO or Supabase Storage directly. A storage adapter should expose operations such as:

```ts
interface PrivateObjectStorage {
  put(input: PutPrivateObject): Promise<StoredObject>;
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

## Privacy rules

Candidate CVs and other PII-bearing files are private by default.

- No public buckets.
- No permanent public URLs.
- Downloads require application authorization before a short-lived signed URL is issued.
- Object keys must not contain raw email addresses, phone numbers, tokens, or other avoidable PII.
- Upload validation must enforce allowed MIME types and size limits when CV/media features are implemented.

## Local parity

`infra/docker/docker-compose.yml` starts MinIO and a one-shot initializer that creates `recruitops-private` and disables anonymous access. `pnpm infra:setup` generates ignored local credentials rather than committing reusable secrets.

The hosted Supabase bucket remains separate from local development data.
