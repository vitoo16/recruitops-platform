# Commission ledger API

The commission ledger is API-owned financial data. Browser clients never write ledger rows directly.

## Authorization

The current ledger read surface is limited to `OWNER` and `ADMIN`. Recruiter/CTV self-service views are deferred to the commission dashboard slice, where beneficiary scoping can be enforced explicitly instead of exposing the full ledger.

## `GET /commissions`

Returns a paginated list of commission transactions. Optional filters:

- `candidateId`
- `jobId`
- `beneficiaryUserId`
- `milestone`: `INTERVIEW_INVITED` or `WORKED_30_DAYS`
- `status`: `ACCRUED`, `BATCHED`, `PAID`, `VOIDED`
- `page`
- `pageSize`

Amounts are integer minor units and must remain within the JavaScript safe-integer range at the API boundary. A persisted value outside that range fails closed instead of being rounded.

## `GET /commissions/:id`

Returns one transaction by UUID or `404 COMMISSION_TRANSACTION_NOT_FOUND`.

## Write boundary

There is intentionally no public `POST`, `PATCH` or `DELETE` route for `CommissionTransaction`.

The repository exposes an internal idempotent `accrue` primitive keyed by `idempotencyKey`. Reconciliation will transition ledger state through controlled service operations rather than arbitrary browser writes.

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

Later-day submissions never receive a share. The engine does not use the host/server timezone and does not provide a hidden timezone default. The reconciliation slice must pass the configured business timezone explicitly.

The allocation service remains internal. It is intentionally not wired to an arbitrary browser-write endpoint and is not invoked immediately on an application status transition; the reconciliation flow will call it only when the source set for the payout period is stable.

## Source attribution

New applications persist `sourceUserId` from the authenticated principal supplied by `AuthGuard`; the browser cannot choose another beneficiary ID. `interviewInvitedAt` is persisted separately from `interviewAt` because the stakeholder rule earns the first commission when the candidate is invited/called to interview.
