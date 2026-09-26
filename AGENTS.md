# Mandatory Agent Instructions — RecruitOps

These rules apply to every coding or documentation agent working in this repository.

## 1. Skill routing is mandatory

Before any non-trivial task:

1. Classify the task by domain.
2. Read `.agents/SKILL_REGISTRY.md`.
3. Load every applicable installed skill before planning or implementation.
4. Combine multiple skills for cross-domain tasks.
5. Do not skip a skill because the task appears small.
6. If a required skill is unavailable, state that explicitly and use repository conventions plus current official documentation.

## 2. Master plan is the single execution tracker

`docs/plans/MASTER_PLAN.md` is the only project execution checklist.

Rules:
- Check an item only after it is actually completed and verified.
- Never duplicate the same work as another checklist item.
- Before starting work, inspect already-completed items.
- When implementation completes, update the same plan in the same change.
- Do not create competing roadmap/checklist files.

## 3. User and product requirements are authoritative

Do not silently remove, simplify, substitute, or reinterpret requirements.

Unknown requirements must be:
- clarified,
- documented as an assumption,
- or marked unresolved.

Never invent business rules.

## 4. Third-party APIs require current official documentation

For Meta/Facebook, Instagram, Threads, LinkedIn, TikTok, Zalo, Google, Gmail,
n8n, Cloudflare, or any external provider:

- verify current official documentation before implementation;
- never rely only on model memory;
- never use undocumented/private endpoints;
- never scrape credentials or sessions;
- never bypass platform permission systems.

If an official API cannot perform the requested action, build a compliant human-in-the-loop/manual-assist path and document the limitation.

## 5. Documentation is part of implementation

A change is not Done if relevant documentation is stale.

Update as applicable:
- PRD
- design docs
- architecture
- API contracts
- database docs/ERD
- sequence/state diagrams
- n8n docs
- ADRs
- runbooks
- deployment docs
- security docs

## 6. Diagram-as-code is mandatory

Use Mermaid as canonical diagram source.

Use:
- C4/context-style flow → system boundaries
- container diagram → deployable/runtime parts
- ER → database relations
- sequenceDiagram → integration interactions
- stateDiagram → lifecycle state
- flowchart → workflows/decision logic

Every diagram must render and reflect current behavior.

## 7. Frontend rules

Must use:
- TypeScript strict mode
- Next.js best practices
- React composition patterns
- shadcn/ui
- Tailwind CSS
- React Hook Form
- Zod
- i18n

Do not hand-build primitive components already provided by the approved UI system.

All user-facing strings must be localized through i18n.
Required locales: `vi`, `en`.

Accessibility must include semantic HTML, keyboard access, focus visibility, labels,
accessible dialogs, screen-reader support, and reduced-motion respect.

## 8. Backend boundaries

Every external input must be validated, including:
- REST payloads
- query parameters
- OAuth callbacks
- webhooks
- queue jobs
- n8n callbacks
- file uploads

Never trust raw JSON.

## 9. External API adapters are mandatory

Business/domain logic must not directly depend on vendor SDKs.

Use interfaces such as:
- `SocialPublisher`
- `SocialAccountProvider`
- `WebhookProvider`
- `MediaPublisher`
- `ManualDistributionProvider`

## 10. Async jobs must be reliable

All background jobs must consider:
- idempotency
- retries
- exponential backoff
- timeout
- concurrency limits
- rate limits
- dead-letter handling
- graceful shutdown
- duplicate execution
- observability

Never assume exactly-once execution.

## 11. Database rules

Every schema change must evaluate:
- normalization
- constraints
- indexes
- query patterns
- transaction boundaries
- migration/rollback strategy
- zero-downtime compatibility
- PII classification
- audit requirements

Money must not use floating point.
Use `DECIMAL/NUMERIC` or integer minor units.

Use timezone-aware timestamps.

## 12. Security is blocking

Never:
- hard-code secrets
- commit tokens
- log OAuth tokens
- expose refresh tokens
- store credentials in plaintext
- put secrets in ordinary n8n text fields

CVs, phone numbers, emails, candidate records, and OAuth credentials are sensitive/private data.
Apply least privilege and auditable access.

## 13. Webhook rules

Webhook receivers must consider:
- signature verification
- timestamp/replay protection
- idempotency
- deduplication
- rate limiting
- safe logging
- raw-body requirements
- safe error responses

## 14. n8n rules

For every n8n task, load `using-n8n-skills-official` first.

Mandatory lifecycle:

`PLAN → BUILD → VALIDATE → TEST → PUBLISH → HANDOFF`

Do not publish an unvalidated workflow.
Use n8n credential storage for credentials.
Unattended workflows require explicit error handling.

## 15. Testing requirements

Use the appropriate mix of:
- unit tests
- integration tests
- E2E tests

Critical product flows require Playwright E2E coverage.
Bug fixes should include regression coverage where practical.

## 16. Git rules

Use atomic Conventional Commits:

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `test:`
- `chore:`

Do not combine unrelated changes.

## 17. Completion gate

Do not mark work Done until applicable checks pass:
- formatting
- lint
- typecheck
- unit tests
- integration tests
- E2E
- build
- security review
- accessibility review
- documentation check
- Mermaid validation
- migration validation
- API contract check

If a check cannot run, report it. Never fabricate verification.
