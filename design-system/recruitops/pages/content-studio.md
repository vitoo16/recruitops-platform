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
          → Publication readiness
            → API destination
              → Publish now → durable queue
              → Schedule date/time → delayed durable queue
                → Publication status / error / retry
```

The UI must make that dependency visible. A platform media selection cannot exist before its platform variant is persisted. Publish Now and Schedule cannot start until the canonical Post is `READY`, the platform variant is persisted, and an eligible API destination has a connected account.

## Composition

- `ContentMediaWorkspace`: orchestration and feature composition only.
- `PostDraftPanel`: job/post context and canonical draft creation.
- `MediaWorkspacePanel`: private upload plus post-owned media inventory.
- `PostVariantMediaPanel`: platform-specific copy and explicit media ordering.
- `PublishNowPanel`: readiness, eligible API-destination choice and immediate queue-acceptance feedback only.
- `PublicationSchedulePanel`: future date/time selection plus persisted upcoming scheduled-publication calendar only.
- `PublicationStatusPanel`: persisted execution state, sanitized errors and guarded manual retry only.
- `useContentStudioSession`: authentication, role and job context.
- `usePostMediaWorkspace`: canonical Post and private media behavior.
- `usePostVariantWorkspace`: platform variant and ordered media-selection behavior.
- `usePublishNowWorkspace`: publication-readiness and idempotent publish-now request behavior.
- `usePublicationScheduleWorkspace`: local date/time intent, timezone conversion and retry-stable scheduling request behavior.
- `usePublicationStatusWorkspace`: status refresh and manual-retry orchestration.
- `useContentStudio`: composes the bounded hooks and shared error surface.

Provider SDK behavior does not belong in these UI hooks. Publication execution belongs to the worker. If any bounded hook begins mixing another domain responsibility, split it before extending the feature.

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
- Provider execution history, manual retry and scheduling controls do not belong in `PublishNowPanel`.
- Viewer/read-only roles may inspect readiness but cannot start a publication.

## Schedule UX

- Use native `date` and `time` controls instead of inventing a custom date-picker primitive.
- Make the browser/device timezone explicit. Convert the selected local date/time to one absolute ISO instant before sending it to the API; the durable `Publication.scheduledAt` timestamp is authoritative after persistence.
- The product requirements currently define no business timezone and no arbitrary maximum schedule horizon, so the UI must not invent either.
- A schedule must be in the future according to the server. If the connected account already has a known expiry, the scheduled instant must also fall before that expiry; otherwise require reconnect or a nearer time instead of accepting a knowingly impossible dispatch.
- Schedule submission reuses the same Publication UUID after an uncertain queue response as long as variant, destination, date and time are unchanged. Any user change to that intent creates a new UUID.
- `SCHEDULED` means a delayed BullMQ job was accepted; it does not mean the provider has published or that a future provider credential/runtime condition is guaranteed.
- The upcoming calendar is derived from persisted `SCHEDULED` Publication records, not local optimistic state. Group entries by local calendar day and show the destination plus scheduled local time.
- An overdue `SCHEDULED` instant is an operational signal that the worker may not have claimed the delayed job yet; it must not be rendered as provider failure without persisted failure state.
- Viewer/read-only roles may inspect the upcoming calendar but cannot create schedules.

## Publication-status UX

- Status is read from persisted `Publication` state, never inferred from button clicks or queue-acceptance copy.
- Show automatic `RETRY_WAITING` timing without exposing a manual retry action; BullMQ/worker backoff remains authoritative.
- Manual retry is available only for a persisted `FAILED` state that the API marks retryable.
- `PUBLICATION_AMBIGUOUS_OUTCOME` and identity-integrity failures require manual provider review and must not expose a retry action, because blindly replaying them could duplicate a real provider post.
- Retrying a retained failed BullMQ job reuses the same Publication identity and resets the retry budget. If retention already removed the job, RecruitOps may re-enqueue the same Publication identity rather than create a second Publication.
- Viewer/read-only roles can inspect status/errors but cannot retry.
- Error text shown to users must remain sanitized operational metadata; never expose provider access tokens, request bodies, private storage URLs or secret-bearing provider responses.
- Status lists are intentionally bounded to the most recent 50 attempts per variant; communicate truncation instead of silently implying the list is complete.

## Visual treatment

Use operational panel density rather than cinematic page spacing. Platform selection and variant copy are primary; media ordering is secondary but visually adjacent; immediate dispatch and scheduling are explicit sibling actions followed by persisted operational status. Avoid decorative animation, badges, gradients, or marketing-style AIDA sections in this workflow.
