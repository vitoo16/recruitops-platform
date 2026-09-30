# Code Scanning Operations

## CodeQL scope

RecruitOps uses GitHub CodeQL advanced setup for the repository's JavaScript and TypeScript code. The workflow runs the `security-extended` query suite on pull requests targeting `main`, pushes to `main`, and a weekly scheduled scan.

## Triage

When CodeQL reports a finding:

1. identify the affected source path and data flow;
2. confirm whether the finding is reachable in RecruitOps runtime behavior;
3. fix the underlying source-code issue rather than suppressing the query by default;
4. add regression coverage where practical;
5. rerun the CodeQL workflow and the normal repository CI gates;
6. document any accepted residual risk during production-readiness review.

A query suppression or dismissal must have a concrete documented rationale. Security findings must never be hidden solely to make a pull request green.

## Permissions

The CodeQL workflow grants repository contents read access and `security-events: write` only so analysis results can be uploaded to GitHub code scanning. It does not require application, provider, database, or deployment secrets.
