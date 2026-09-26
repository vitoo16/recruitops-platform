# n8n Architecture Boundary

n8n is an orchestration layer.

## NestJS owns
- business rules
- candidate/application state
- publication state
- commission state
- authorization
- audit
- persistent system truth

## n8n may own
- sending candidate email
- sheet synchronization
- scheduled reports
- notifications
- integration glue
- operational automation

Every n8n task uses:

`PLAN → BUILD → VALIDATE → TEST → PUBLISH → HANDOFF`

Credentials live in n8n credential storage, not ordinary node fields.
