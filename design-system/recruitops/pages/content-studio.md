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
```

The UI must make that dependency visible. A platform media selection cannot exist before its platform variant is persisted.

## Composition

- `ContentMediaWorkspace`: orchestration and feature composition only.
- `PostDraftPanel`: job/post context and canonical draft creation.
- `MediaWorkspacePanel`: private upload plus post-owned media inventory.
- `PostVariantMediaPanel`: platform-specific copy and explicit media ordering.
- `useContentStudioSession`: authentication, role and job context.
- `usePostMediaWorkspace`: canonical Post and private media behavior.
- `usePostVariantWorkspace`: platform variant and ordered media-selection behavior.
- `useContentStudio`: composes the three bounded hooks and shared error surface.

Provider SDK behavior does not belong in these UI hooks. If any bounded hook begins mixing another domain responsibility, split it before extending the feature.

## Media-selection UX

- Checkbox selection is always paired with an ordered selected-media list.
- Reordering has explicit keyboard-accessible buttons; drag-only ordering is prohibited.
- The selected order is the provider payload order.
- Empty selection is a valid persisted state; adapters decide whether a platform requires media.
- Never expose private storage keys or long-lived signed URLs in this surface.

## Visual treatment

Use operational panel density rather than cinematic page spacing. Platform selection and variant copy are primary; media ordering is secondary but visually adjacent. Avoid decorative animation, badges, gradients, or marketing-style AIDA sections in this workflow.
