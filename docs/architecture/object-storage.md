# Object Storage Architecture

## Decision

RecruitOps uses a provider-neutral private-file boundary:

- **Local development:** MinIO in Docker Compose.
- **Hosted free environment:** private Supabase Storage bucket `recruitops-private`.
- **Future production:** an approved S3-compatible provider may replace either implementation without changing candidate/media domain models.

## Current implementation boundary

The shared file contract in `@recruitops/contracts` defines validated upload intents, injected upload policies and deterministic private object keys. Browser-hosted uploads use the Supabase adapter in `apps/web/src/lib/storage/private-files.ts`.

Object keys intentionally follow the existing RLS contract:

```text
<authenticated-user-uuid>/<namespace>/<owner-entity-uuid>/<object-uuid>.<extension>
```

The original filename is stored as metadata only and is never embedded in the object key. This prevents avoidable candidate PII from leaking into storage paths.

## Domain persistence

`MediaAsset` stores content-media metadata associated with a `Post`. `CandidateDocument` stores CV/document metadata associated with a `Candidate` and optionally an `Application`. File bytes remain in private object storage; the database stores only metadata and the unique storage key.

## Privacy rules

Candidate CVs and other PII-bearing files are private by default.

- No public buckets.
- No permanent public URLs.
- The authenticated user ID is the first object-key segment so Supabase RLS can enforce owner-scoped access.
- OWNER/ADMIN cross-user access remains controlled by the existing Supabase RLS policies.
- Downloads use short-lived signed URLs; the browser adapter rejects TTL values above 15 minutes.
- Object keys never contain raw email addresses, phone numbers, original filenames, tokens or other avoidable PII.
- Upload MIME/size constraints are injected through `PrivateFileUploadPolicy`; product-specific limits must be explicitly configured rather than silently hard-coded into domain contracts.
- Browser upload verifies authenticated-user ownership and verifies that `File.size` / `File.type` match the validated upload intent.

## Local parity

`infra/docker/docker-compose.yml` starts MinIO and a one-shot initializer that creates `recruitops-private` and disables anonymous access. `pnpm infra:setup` generates ignored local credentials rather than committing reusable secrets.

The hosted Supabase bucket remains separate from local development data.

## Remaining work

The storage foundation does not by itself complete the user-facing media/CV flow. Persistence APIs, authorization-aware metadata creation and upload/download UI must be wired before the corresponding Master Plan items are marked complete.
