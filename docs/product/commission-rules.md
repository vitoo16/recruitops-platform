# Commission and reconciliation rules

## Source of truth

These rules are derived from the stakeholder-provided document `CTV TUYỂN DỤNG ONLINE LUCKY LIFE.pdf` used during product discovery. This document is the business source of truth for the current commission implementation slice.

## Confirmed stakeholder rules

1. Recruiters/CTV are paid commission rather than a salary by default.
2. Commission is earned at two recruitment milestones:
   - when the candidate is called/invited to interview;
   - when the candidate has worked for 30 days.
3. The interview commission varies by job/position. The stakeholder document gives examples of 50,000 VND, 70,000 VND, 100,000 VND and 150,000 VND, and states that the exact amount is maintained in the master job sheet.
4. The worked-30-days commission also varies by job/position. The stakeholder document states that the smallest amount is 1,000,000 VND per candidate and that exact amounts are maintained in the master job sheet.
5. Payouts occur twice each month:
   - day 5: interview commission;
   - day 15: worked-30-days commission.
6. Duplicate-CV ownership rule:
   - if multiple CTV submit the same CV on the same calendar day, the applicable commission is split equally among those CTV;
   - if submissions occur on different calendar days, only the CTV whose submission belongs to the earliest calendar day participate in the commission split.

## Implementation decisions derived from those rules

The following are system-design decisions needed to make the stakeholder rules deterministic and auditable. They are not additional stakeholder business rules.

- Money is stored as integer minor units; floating-point arithmetic is prohibited.
- Job-specific interview and worked-30-days commission amounts are explicit configuration, not inferred from the example amounts above.
- A commission event must be idempotent for one candidate/job/milestone so repeated status updates cannot pay twice.
- Duplicate ownership is evaluated per candidate + job using the application source timestamp and authenticated source user.
- "Same day" is evaluated using the configured business timezone. Until a separate business-timezone setting exists, the implementation must persist the source instant and make the chosen timezone explicit at the reconciliation boundary rather than silently using the server timezone.
- If an equal split cannot be represented exactly in integer minor units, the remainder is allocated deterministically so the sum of ledger entries equals the configured commission amount. The allocation order must be stable and auditable.
- Reconciliation batches are immutable snapshots of eligible unpaid commission transactions for the corresponding payout class. Marking a batch paid must be explicit and auditable; ledger history is never rewritten.

## Out of scope / unresolved external data

The exact per-job commission values remain operational data from the stakeholder's master job sheet. The repository may implement fields, validation, ledger logic and reconciliation without inventing those amounts. Production payout calculations require those fields to be populated for the relevant jobs.
