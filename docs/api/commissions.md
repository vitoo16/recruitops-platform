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

The repository exposes an internal idempotent `accrue` primitive keyed by `idempotencyKey`. The duplicate-CV allocation slice will be responsible for constructing validated accrual inputs only after it resolves the earliest submission day and eligible CTV split. Reconciliation will transition ledger state through controlled service operations rather than arbitrary browser writes.

## Source attribution

New applications persist `sourceUserId` from the authenticated principal supplied by `AuthGuard`; the browser cannot choose another beneficiary ID. `interviewInvitedAt` is persisted separately from `interviewAt` because the stakeholder rule earns the first commission when the candidate is invited/called to interview.
