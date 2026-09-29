# Content Studio Override

Inherits `../MASTER.md`.

## Task hierarchy

Content Studio follows this operational sequence:

```text
Recruitment job
  → Canonical post
    → Private media library
      → Platform variant
        → Explicit ordered media selection
          → Publish-now readiness
            → API destination
              → Durable dispatch queue
```

The UI must make that dependency visible. A platform media selection cannot exist before its platform variant is persisted. Publish Now cannot start until the canonical Post is `READY`, the platform variant is persisted, and an eligible API destination has a connected, unexpired social account.

## Composition

- `ContentMediaWorkspace`: orchestration and feature composition only.
- `PostDraftPanel`: job/post context and canonical draft creation.
- `MediaWorkspacePanel`: private upload plus post-owned media inventory.
- `PostVariantMediaPanel`: platform-specific copy and explicit media ordering.
- `PublishNowPanel`: readiness, eligible API-destination choice and queue-acceptance feedback only.
- `useContentStudioSession`: authentication, role and job context.
- `usePostMediaWorkspace`: canonical Post and private media behavior.
- `usePostVariantWorkspace`: platform variant and ordered media-selection behavior.
- `usePublishNowWorkspace`: publication-readiness and idempotent publish-now request behavior.
- `useContentStudio`: composes the bounded hooks and shared error surface.

Provider SDK behavior does not belong in these UI hooks. Publication execution and provider status polling also do not belong in `PublishNowPanel`; those remain separate operational domains. If any bounded hook begins mixing another domain responsibility, split it before extending the feature.

## Media-selection UX

- Checkbox selection is always paired with an ordered selected-media list.
- Reordering has explicit keyboard-accessible buttons; drag-only ordering is prohibited.
- The selected order is the provider payload order.
- Empty selection is a valid persisted state; adapters decide whether a platform requires media.
- Never expose private storage keys or long-lived signed URLs in this surface.

## Publish-now UX

- The primary action is framed as queue acceptance, not provider success.
- Always state that `Queued` does not mean `Published`.
- Destination readiness comes from the API and is revalidated server-side when the command is submitted.
- Only API-mode destinations appear in Publish Now. Manual Assist remains a separate workflow.
- A failed or uncertain queue request retains the same client-generated Publication UUID for safe retry; changing the destination starts a new intent and therefore a new UUID.
- Do not add provider polling, retry history, or scheduling controls to this panel. Those belong to their dedicated Phase 5 surfaces.
- Viewer/read-only roles may inspect readiness but cannot start a publication.

## Visual treatment

Use operational panel density rather than cinematic page spacing. Platform selection and variant copy are primary; media ordering is secondary but visually adjacent; publication dispatch is a final explicit step. Avoid decorative animation, badges, gradients, or marketing-style AIDA sections in this workflow.
