# Diagram Index

Each file below is canonical Mermaid source embedded in Markdown and should render directly on GitHub. Do not duplicate diagram source elsewhere.

## Architecture and deployment

- `system-context.md`
- `container-architecture.md`
- `free-tier-deployment.md`

## Job, content and files

- `database-erd.md` — current implemented persistence models only.
- `job-content-erd.md` — Phase 3 Job/Post/PostVariant/MediaAsset view.
- `job-hub-sequence.md` — authenticated Job Hub browser/API/database flow.
- `content-draft-state.md`
- `private-file-flow.md`

## Publishing

- `social-domain-erd.md`
- `social-publishing-sequence.md`
- `publication-state.md`
- `manual-distribution-flow.md`

## Candidate operations

- `candidate-application-erd.md`
- `candidate-lifecycle.md`
- `auth-session-sequence.md`

## Maintenance rule

The implementation schema and executable state contracts are authoritative. Update the relevant Mermaid source in the same PR whenever a persisted relation, lifecycle, or integration boundary changes.
