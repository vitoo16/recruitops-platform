# AutoSkills Setup

Use AutoSkills for stack-based discovery, then install manual skills from `SKILL_REGISTRY.md`.

## Pinned audit command

The repository audit workflow currently pins AutoSkills v0.3.3:

```bash
npx --yes autoskills@0.3.3 --dry-run
```

The dry-run is executed by `.github/workflows/autoskills-audit.yml` and its report is uploaded as a GitHub Actions artifact.

## Verified detection — 2026-09-27

The first repository dry-run completed successfully and detected:

- TypeScript
- Turborepo
- Node.js
- Vitest
- NestJS
- React
- Next.js
- Tailwind CSS
- shadcn/ui
- Zod
- Prisma

Detected combinations:

- React + shadcn/ui
- Tailwind CSS + shadcn/ui

AutoSkills recommended 22 stack skills, including TypeScript, Turborepo, Node/NestJS, Vitest, React/Next.js, Tailwind/shadcn, Zod, Prisma, frontend design, accessibility and SEO skills. `SKILL_REGISTRY.md` is the canonical routing registry and includes the additional recommendations surfaced by that run.

## Installation workflow

Dry-run and installation are intentionally separate gates:

```bash
npx --yes autoskills@0.3.3 --dry-run
npx --yes autoskills@0.3.3 -y
```

Always review dry-run output before installation. Do not mark the installation checklist complete merely because the dry-run passed.

AutoSkills is not the complete governance layer for this project. Skills for PRD, architecture, technical writing, diagrams, PostgreSQL design, security, n8n, API integrations, runbooks and observability may require manual installation or explicit review even when they are not stack-detected.

## Agent routing

```text
Task
 ↓
Classify domains
 ↓
Read SKILL_REGISTRY
 ↓
Load all applicable skills
 ↓
Read current plan + relevant docs
 ↓
Check whether work already exists
 ↓
Plan
 ↓
Implement
 ↓
Validate
 ↓
Update docs/diagrams
 ↓
Run quality gates
 ↓
Tick exact MASTER_PLAN item
```
