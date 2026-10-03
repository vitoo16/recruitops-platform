# Commission ledger API

The commission ledger and reconciliation batches are API-owned financial data. Browser clients never write ledger rows directly.

## Authorization

The current financial surface is limited to `OWNER` and `ADMIN`. Recruiter/CTV self-service views are deferred to the commission dashboard slice, where beneficiary scoping can be enforced explicitly instead of exposing the full ledger.

## `GET /commissions`

Returns a paginated list of commission transactions. Optional filters:

- `candidateId`
- `jobId`
- `beneficiaryUserId`
- `milestone`: `INTERVIEW_INVITED` or `WORKED_30_DAYS`
- `status`: `ACCRUED`, `BATCHED`, `PAID`, `VOIDED`
- `reconciliationBatchId`
- `page`
- `pageSize`

Amounts are integer minor units and must remain within the JavaScript safe-integer range at the API boundary. A persisted value outside that range fails closed instead of being rounded.

## `GET /commissions/:id`

Returns one transaction by UUID or `404 COMMISSION_TRANSACTION_NOT_FOUND`.

## Reconciliation batches

### `GET /commissions/reconciliation-batches`

Returns paginated batch summaries. Optional filters are `status`, `milestone`, `payableOn`, `page` and `pageSize`.

### `GET /commissions/reconciliation-batches/:id`

Returns one immutable batch snapshot including its transaction IDs.

### `POST /commissions/reconciliation-batches`

Creates an immutable payout snapshot from explicit ledger rows. The request contains a client-generated batch UUID, `payableOn` and one or more `transactionIds`.

The server derives the payout class from the confirmed stakeholder rule: day 5 maps to `INTERVIEW_INVITED`, and day 15 maps to `WORKED_30_DAYS`. Every selected transaction must exist, still be unbatched `ACCRUED`, match that payout class and use the same currency. Creation and the ledger transition to `BATCHED` occur in one database transaction. Reusing the same batch UUID with the exact same snapshot is idempotent; reusing it with different snapshot data fails with a conflict.

The API deliberately does not infer an intra-day cutoff that the stakeholder source does not define. Operators select the transactions that belong to the payout snapshot explicitly.

### `POST /commissions/reconciliation-batches/:id/mark-paid`

Marks one OPEN batch paid. The API first verifies that the linked `BATCHED` ledger rows still match the immutable snapshot, then atomically changes those rows to `PAID` and records `paidByUserId` plus `paidAt` on the batch. Repeating the operation on an already-paid batch is idempotent.

## Write boundary

There is intentionally no public `POST`, `PATCH` or `DELETE` route for `CommissionTransaction`. The repository exposes an internal idempotent `accrue` primitive keyed by `idempotencyKey`; only controlled reconciliation operations transition ledger payout state.

## Duplicate-CV allocation

`CommissionAllocationService` implements the stakeholder duplicate-CV rule before ledger accrual:

1. load all applications for the same candidate + job;
2. map every `sourcedAt` instant to a calendar date using an explicitly supplied IANA business timezone;
3. select only applications from the earliest calendar date;
4. fail closed if any earliest-day application lacks authenticated `sourceUserId` attribution;
5. collapse multiple earliest-day applications from the same source user into one beneficiary;
6. split the configured job commission equally across the distinct earliest-day beneficiaries;
7. allocate indivisible minor-unit remainders deterministically by source time/application identity so the ledger sum exactly matches the configured base amount;
8. accrue each beneficiary through a stable candidate + job + milestone + beneficiary idempotency key.

Later-day submissions never receive a share. The engine does not use the host/server timezone and does not provide a hidden timezone default.

The allocation service remains internal and is not invoked immediately on an application status transition. The reconciliation/export workflow slice will orchestrate accrual only when the source set for the payout period is stable and will pass the configured business timezone explicitly. ReconciliationBatch itself groups already-accrued ledger rows; it does not silently trigger allocation.

## Source attribution

New applications persist `sourceUserId` from the authenticated principal supplied by `AuthGuard`; the browser cannot choose another beneficiary ID. `interviewInvitedAt` is persisted separately from `interviewAt` because the stakeholder rule earns the first commission when the candidate is invited/called to interview.
