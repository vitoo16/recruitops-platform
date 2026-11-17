# RecruitOps — Local-first CI/CD

This is a GitHub-hosted Actions quota-independent implementation. All nine old workflows remain available with manual workflow_dispatch; push/PR/schedule automation is disabled once merged. This change does NOT assert that the stages have run successfully.

Windows prerequisites: Node 24.21.x, pnpm 12.6.0, Git, Docker Desktop with Linux containers/Compose, Playwright Chromium. For the security/release profile, install the official CodeQL CLI and make codeql available on PATH; AutoSkills requires network access.

    git config core.hooksPath .githooks
    node scripts/local-ci.mjs --profile quick
    node scripts/local-ci.mjs --profile full
    node scripts/local-ci.mjs --profile security
    node scripts/local-ci.mjs --profile release

Quick retains secrets scan, frozen pnpm lockfile install, formatting, Docker configuration, Prisma validation, typecheck, Vitest and build.
Full also brings up an ISOLATED local Redis container mapped only to 127.0.0.1:16379, runs worker integration, Playwright E2E, desktop/mobile web-performance budgets and dependency audit. Container is removed in cleanup even after test failures.
Security adds the former AutoSkills registry check and local CodeQL CLI security-extended scan. Unavailable CodeQL MUST fail the security/release profile rather than be counted as a pass. CodeQL result is stored locally; this does not upload SARIF to GitHub Security.
Release requires all Security stages and clean Git, then stages checked build folders plus a commit-manifest locally; it never deploys to Render or Supabase.

Run reports: .local-ci/runs/<timestamp>-<profile>/summary.json and step logs. The pre-push hook (opt-in with core.hooksPath above) runs Quick only. Require successful Full and Security on the exact release SHA, independent review, and deployed-service verification before approval.

Deployment is still managed by Render/Supabase configuration and any provider auto-deploy settings. GitHub Actions is NOT the Render deployment mechanism; configure provider auto-deploy separately if you need strictly manual promotions. No production credentials are read by this runner.

Important differences: release staging is not cloud CD; no hosted service is changed. The original lockfile export/commit workflows are manual-only; update pnpm-lock.yaml deliberately with pnpm install --lockfile-only --no-frozen-lockfile, review and commit it. The native CodeQL CLI and AutoSkills may use network resources and must be installed/trusted explicitly.
