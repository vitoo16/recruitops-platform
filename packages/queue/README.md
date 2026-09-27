# Queue Package

`@recruitops/queue` owns Redis/BullMQ queue primitives shared by the API and worker runtimes.

## Publication scheduling

- Queue: `publication-dispatch`
- Job: `dispatch-publication`
- BullMQ `jobId`: the durable Publication UUID
- Delayed execution: `scheduledAt - now`, clamped to zero
- Automatic retries: bounded attempts with exponential backoff
- Redis prefix: `recruitops`

Using the durable Publication UUID as the BullMQ job ID prevents a second enqueue from creating a second active/delayed job for the same Publication. The database `Publication.idempotencyKey` remains the business idempotency boundary when a provider call is eventually executed.

This package intentionally does **not** call social-provider APIs. Provider execution belongs in the publishing worker and remains gated until the corresponding official provider adapter is implemented.
