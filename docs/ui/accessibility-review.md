# Accessibility Review

## Scope

This review covers the current RecruitOps web application accessibility baseline and the critical interaction patterns already implemented in the product. It is a product engineering review, not a formal accessibility certification or legal conformance statement.

The review combines:

- automated Playwright + axe checks on the rendered public shell in both supported locales (`vi` and `en`);
- keyboard verification for the skip-to-content path;
- source review against the RecruitOps design-system accessibility rules;
- the existing critical-flow Playwright coverage for authenticated publication operations, which continues to protect native controls, mutation visibility by role, async status/error messaging and keyboard-usable actions.

Automated axe checks are intentionally asserted against every reported violation for the selected WCAG A/AA tag set rather than only serious/critical impact levels.

## Review basis

RecruitOps' design system requires:

- keyboard and pointer support for primary tasks;
- accessible names for icon-only actions;
- buttons for actions and links for navigation;
- visible focus behavior;
- async errors near the workflow and announced to assistive technology;
- reduced-motion support;
- minimum 44 px interaction targets;
- labeled forms, readable errors, localization and overflow-safe content.

The application shell provides a semantic `main` landmark, a single visible primary heading, decorative icons hidden from assistive technology where appropriate, an accessible language-switch action, and a localized skip link that becomes visible on keyboard focus and moves focus to the main landmark.

## Automated gate

`apps/web/e2e/accessibility.spec.ts` verifies:

1. the logged-out shell renders a `main` landmark and level-one heading;
2. the rendered Vietnamese shell has zero axe violations for the configured WCAG A/AA rule tags;
3. after switching locale, the rendered English shell also has zero violations for the same rule set;
4. the first keyboard Tab exposes and focuses the skip link;
5. activating the skip link moves URL focus intent to `#main-content` and the main landmark receives focus.

The accessibility gate runs through the repository Playwright E2E workflow and uses deterministic mocked auth/API boundaries rather than production services or credentials.

## Manual findings

### Semantics and navigation

- The application shell uses native landmarks, headings, links and buttons rather than click handlers on generic containers for its primary navigation/actions.
- The skip link is hidden visually until keyboard focus and targets a programmatically focusable main landmark.
- Decorative `lucide-react` icons in the reviewed shell are marked `aria-hidden` when text already supplies the accessible name.

### Forms and actions

- Existing feature work is governed by native form/control semantics and the shared shadcn-based primitive layer.
- Provider connection, publishing, scheduling, retry, candidate and CV workflows use explicit buttons/inputs instead of pointer-only custom controls.
- Existing feature PRs established localized accessible labels, async `role=status` / `role=alert` feedback, keyboard-native controls and minimum 44 px actions for the critical operational surfaces.

### Focus and motion

- Global/product rules require visible `:focus-visible` treatment and reduced-motion handling.
- The reviewed skip-link path supplies an explicit keyboard escape directly to main content.
- Operational loading/refresh affordances introduced by current feature slices are required to respect reduced-motion preferences.

### Localization and content resilience

- Accessibility checks run in both required locales, reducing the risk that translated accessible names or localized content break the shell.
- RecruitOps design rules require long operational/user content to wrap, truncate or otherwise avoid horizontal overflow instead of relying on fixed strings.

## Limitations

Axe evaluates rendered content and therefore does not prove accessibility for every inactive dialog, hidden state, provider callback, future feature, browser/assistive-technology combination or external provider surface. Authenticated dynamic workflows are additionally protected by existing functional E2E and repository UI rules, but this review does not claim that every possible runtime state has been independently scanned with axe.

Manual screen-reader testing with multiple assistive-technology/browser combinations is outside the current automated CI environment. Any future non-trivial UI change must continue to pass the accessibility gate and the repository's per-change UI review requirements.

## Completion criteria

The Phase 9 accessibility review is complete when the strengthened Playwright/axe gate, normal CI, integration checks and existing critical E2E remain green on this PR together with this documented review. Future UI changes remain subject to the same accessibility quality gate and can reopen accessibility work if regressions or new interaction patterns are introduced.
