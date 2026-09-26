# AutoSkills Setup

Use AutoSkills for stack-based discovery, then install manual skills from `SKILL_REGISTRY.md`.

## Workflow

```bash
npx autoskills --dry-run
npx autoskills
```

Always review dry-run output before installation.

AutoSkills is not the complete governance layer for this project. Skills for PRD, architecture,
technical writing, diagrams, PostgreSQL design, security, n8n, API integrations, runbooks and
observability may need manual installation.

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
