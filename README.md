# RecruitOps Platform

RecruitOps is a recruitment operations platform for managing jobs, social recruitment content,
multi-channel publishing, scheduling, candidates, CVs, hiring status, commissions, and supporting automations.

This repository is intentionally organized as a senior-level monorepo: product requirements,
architecture, code, automation, infrastructure, quality gates, agent rules, and diagrams are separated
by responsibility and linked from a single master plan.

## Repository principles

- Official APIs first.
- Human-in-the-loop when a platform does not expose a supported publishing API.
- Third-party integrations live behind adapters.
- NestJS remains the business/system-of-record boundary.
- n8n is orchestration, not the core backend.
- Documentation and diagrams are versioned with code.
- Mermaid is the canonical diagram format.
- Every non-trivial agent task must load applicable skills first.
- No feature is Done before the relevant quality gates pass.
- `docs/plans/MASTER_PLAN.md` is the only execution checklist.

## High-level structure

```text
apps/           deployable applications
packages/       reusable internal packages
automation/     n8n workflows and automation assets
docs/           PRD, architecture, diagrams, ADRs, plan, security, operations
infra/          infrastructure-as-code and local deployment assets
tooling/        repository developer tooling
.agents/        agent skill registry and AutoSkills instructions
.github/        GitHub collaboration templates and ownership
```

## Start here

1. Read `AGENTS.md`.
2. Read `.agents/SKILL_REGISTRY.md`.
3. Read `docs/product/PRD.md`.
4. Read `docs/architecture/overview.md`.
5. Continue from `docs/plans/MASTER_PLAN.md`.
6. Tick only work that has actually been completed.

## Target stack

- Frontend: Next.js + TypeScript + shadcn/ui + Tailwind CSS
- Forms/validation: React Hook Form + Zod
- i18n: VI + EN
- Backend: NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Queue/Scheduler: Redis + BullMQ
- Object storage: S3/R2-compatible
- Automation: n8n
- Tests: Vitest + Playwright
- Observability: Sentry/OpenTelemetry
- Deployment: Docker first, scalable worker topology later

## Free-tier deployment

The current zero-cost MVP topology is:

- **Frontend:** Render Static Site — `https://recruitops-frontend.onrender.com`
- **Backend API:** Render Free Web Service — `https://recruitops-api.onrender.com`
- **Database + private object storage:** Supabase Free, Singapore
- **Redis:** Render Key Value Free, Singapore
- **Durable external scheduling bridge:** optional QStash later, only when scheduled publishing is implemented

The API can sleep on Render free tier, so production scheduling must not depend on an always-awake process. See `docs/deployment/free-tier.md` for the exact free-tier constraints and upgrade path.
