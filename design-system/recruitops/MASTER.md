# RecruitOps Design System — Master

This file is the visual source of truth for RecruitOps application UI. Page-specific files may refine these rules but must not silently contradict accessibility, semantics, or interaction requirements.

## Product character

RecruitOps is an operations SaaS for repeated work: drafting recruitment content, connecting destinations, publishing, scheduling, candidate handling, and reconciliation. The interface should feel calm, precise, dense enough for daily work, and visually confident without behaving like a marketing landing page.

## Design dials

- Variance: 4/10 — recognizable product rhythm, limited asymmetry where it improves hierarchy.
- Motion: 2/10 — feedback and continuity only; no cinematic scroll behavior in task flows.
- Density: 7/10 — operations-oriented, compact controls with readable spacing and minimum 44 px touch targets.

## Token architecture

Use three layers:

```text
Primitive → Semantic → Component
```

Current implementation tokens live in `apps/web/src/app/globals.css`.

### Primitive

Neutral values provide the base palette. Raw primitives should not be referenced by new feature components when a semantic alias exists.

### Semantic

- `--background`: application canvas
- `--foreground` / `--content-primary`: primary content
- `--content-secondary`: supporting content
- `--border`: structural boundaries
- `--surface-panel`: primary working surface
- `--surface-subtle`: nested/secondary surface
- `--focus-ring`: keyboard focus indication

### Component

- `--radius-panel`: workspace panel radius
- `--shadow-panel`: low-elevation working panel shadow

Add component tokens only when a reusable component has a stable need. Do not create one token per arbitrary occurrence.

## Component architecture

Use this direction:

```text
Page / workspace orchestration
        ↓
Feature sections
        ↓
Composed reusable components
        ↓
shadcn / semantic primitives
```

Rules:
- Presentation components do not call provider APIs directly.
- API/state orchestration should be isolated in feature hooks/services when it would otherwise dominate JSX.
- A component should have one recognizable UI responsibility.
- Shared primitives belong in `components/ui` or a deliberate shared composition layer; feature-specific components stay inside the feature folder.
- Do not grow a single feature workspace file with unrelated forms, media lists, provider state, and business actions.

## Interaction

- Primary tasks must work with keyboard and pointer.
- Icon-only actions require accessible names.
- Prefer buttons for actions and links for navigation.
- Preserve visible focus; use `:focus-visible` behavior.
- Async errors appear near the workflow and are announced.
- Loading states communicate progress without moving layout unnecessarily.
- Do not rely on hover to reveal required controls.

## Motion

Motion is optional, not a requirement. Where used:
- animate transform/opacity rather than layout properties;
- keep transitions short and interruptible;
- honor `prefers-reduced-motion`;
- do not use scroll pinning or choreographed motion in CRUD/operations workflows unless a concrete usability benefit is documented.

## Typography

- Prefer wide, readable headings with balanced wrapping.
- Keep operational body text at 14–16 px equivalent with comfortable line-height.
- Use tabular numerals for ordered counts, financial comparisons, and tabular operational values.
- Avoid decorative meta-label spam.

## Layout

- Use responsive CSS grid/flex rather than JS measurements.
- Use `minmax(0, ...)` for grid columns containing user content.
- Prevent horizontal overflow caused by long names/URLs with `min-w-0`, truncation, or break rules.
- Use panels to group a workflow, not to turn every sentence into a card.

## Accessibility and final review

Every changed UI file must be reviewed against the latest Vercel Web Interface Guidelines before completion. WCAG-oriented semantics, reduced motion, keyboard access, touch target size, form labeling, content overflow, localization, and readable errors are blocking quality concerns.
