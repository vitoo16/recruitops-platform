# Product Requirements Document — RecruitOps

## 1. Problem

Recruitment collaborators repeatedly:
- obtain active jobs and recruitment assets;
- compose posts for multiple social networks;
- publish now or later;
- track where content was posted;
- receive candidates and CVs from different sources;
- forward candidate information;
- track recruitment milestones and commissions.

The workflow is fragmented across social platforms, spreadsheets, messages and email.

## 2. Product goal

Provide one operations workspace for job data, recruitment content, supported multi-channel publishing,
manual-assist distribution, candidate intake, hiring status, commissions, and workflow automation.

## 3. Primary actors

- Recruiter / recruitment collaborator
- Admin / owner
- Read-only reviewer
- Automation service

## 4. Functional scope

### Job Hub
- Manage active/inactive jobs.
- Store JD, company, compensation, location, commission, content templates and media references.
- Support sheet/API import.

### Content Studio
- Canonical post content.
- Platform-specific variants.
- Drafts and previews.
- Media.
- VI/EN localization for application UI.

### Destinations
- Accounts, pages, organizations, OAs, groups/manual destinations.
- Configurable labels/tags.
- Paste URL or select configured destination.

### Publishing
- Publish immediately where official APIs allow.
- Schedule where official APIs allow.
- Manual Assist where official API does not support required posting.
- Persist result/status/error/external post ID.
- Retry safely without duplicates.

### Candidate CRM
- Candidate identity/contact.
- CV attachment.
- source attribution.
- applied job.
- recruitment lifecycle.
- notes/audit.

### Commissions
- Event-based ledger.
- reconciliation batches.
- paid/unpaid state.
- duplicate-candidate policy support.

### Automation
- n8n for email, sheet synchronization, reports, reminders and integration glue.

## 5. Non-functional requirements

### Security
- sensitive credentials encrypted;
- private candidate/CV access;
- least privilege;
- auditable operations;
- webhook verification where supported.

### Reliability
- idempotent workers;
- retries/backoff;
- rate-limit handling;
- terminal-failure visibility.

### Maintainability
- platform adapters;
- modular NestJS domains;
- documentation/diagrams updated with behavior.

### UX
- modern component library;
- no unnecessary custom primitive components;
- responsive;
- accessible;
- VI/EN i18n.

## 6. Out of scope for initial implementation

- Unsupported automation through private/reverse-engineered social endpoints.
- Browser/session scraping to bypass social platform limitations.
- Generic ATS replacement beyond the recruitment workflow required here.

## 7. Success criteria for MVP

- Recruiter can manage jobs and templates.
- Recruiter can create a multi-platform recruitment post.
- Recruiter can choose saved destinations.
- Supported platforms can publish/schedule through official APIs.
- Unsupported destinations receive a clear Manual Assist flow.
- Candidate and CV can be stored and linked to job/source.
- Candidate submission workflow can be automated by n8n.
- Commission events can be recorded without floating-point money errors.
- Failed publications are visible and safely retryable.
