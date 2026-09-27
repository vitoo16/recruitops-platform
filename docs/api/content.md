# Content API

All content routes require an authenticated RecruitOps session. Read operations allow `OWNER`, `ADMIN`, `RECRUITER`, and `VIEWER`; draft creation allows `OWNER`, `ADMIN`, and `RECRUITER`.

## Routes

- `GET /posts?page=1&pageSize=50` — list canonical posts.
- `GET /posts?jobId=<uuid>` — list posts for one recruitment job.
- `GET /posts/:id` — fetch one canonical post.
- `POST /posts` — create a canonical post, defaulting to `DRAFT` when status is omitted.
- `POST /files/media-assets` — register metadata only after a private storage upload succeeds.
- `GET /posts/:postId/media-assets` — list registered media metadata for a post.

## Create post body

```json
{
  "jobId": "uuid",
  "title": "Backend Engineer campaign",
  "baseContent": "We are hiring...",
  "language": "en"
}
```

The API verifies that the referenced Job exists before creating the Post. The database remains authoritative for Job → Post ownership.

## Media boundary

Content media is uploaded from the authenticated browser to the private `recruitops-private` bucket under a generated path:

```text
<user-uuid>/media/<post-uuid>/<object-uuid>.<ext>
```

The browser never sends an arbitrary storage path for registration. The API verifies that the registered path belongs to the authenticated user and target Post. Storage upload and metadata registration are separate operations; registration occurs only after storage reports a successful upload.
