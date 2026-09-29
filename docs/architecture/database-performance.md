# Database Performance Review

## Review scope

This review covers the current hosted RecruitOps Supabase PostgreSQL project and the canonical Prisma access-path design as of 2026-09-30.

The review is intentionally evidence-driven. It does not add or remove indexes merely to satisfy a checklist item. At the time of review, the hosted business tables contain no live application rows, so production query selectivity and index-usage statistics are not yet representative of a real workload.

No production DDL was executed as part of this review.

## Hosted evidence

Supabase Performance Advisor currently reports only the informational `unused_index` lint for the RecruitOps application schema. It reports 32 indexes that have not yet been used; it does not currently report a missing-index or other index-related performance finding that justifies a schema change.

Read-only PostgreSQL statistics from the hosted project show:

- every RecruitOps `public` business table currently has an estimated live-row count of `0`;
- application indexes therefore also show `idx_scan = 0`;
- a small number of sequential scans have occurred during bootstrap, schema verification, integration work, and other low-volume access;
- relation sizes are tiny and dominated by index/page allocation rather than application data.

This is expected for a newly provisioned/low-traffic database. PostgreSQL may prefer a sequential scan for a tiny relation even when a suitable index exists because reading the whole table is cheaper than an index lookup.

Therefore **unused index does not mean unnecessary index** in the current dataset.

## Current index rationale

The canonical Prisma schema already aligns indexes with the principal access paths implemented in RecruitOps.

### Job and content

- `Job(status, updatedAt)` supports operational job lists filtered by lifecycle state and ordered/reviewed by recency.
- `Job(employmentType)` supports employment-type filtering.
- `Post(jobId)` supports canonical content lookup by Job.
- `Post(status, updatedAt)` supports draft/ready/archive operational lists.
- `PostVariant(postId, platform)` is unique and is the natural lookup for one platform variant of one post.
- `MediaAsset(postId, createdAt)` supports ordered media retrieval under a canonical Post.
- `PostVariantMediaAsset` keys preserve selected-asset uniqueness/order and include reverse lookup by media asset.

### Social integrations and publishing

- `SocialAccount(platform, externalAccountId)` is unique for provider-account promotion/reconnect.
- `SocialAccount(platform, status)` supports provider/status connection queries.
- `SocialAccount(expiresAt)` supports credential lifecycle checks.
- `Destination(platform, enabled)` and `Destination(postingMode, enabled)` support publication eligibility filtering.
- `Destination(socialAccountId)` supports exact connected-account joins.
- `Publication(state, scheduledAt)` supports scheduled-dispatch/calendar access.
- `Publication(state, nextRetryAt)` supports retry/backoff operational access.
- `Publication(postVariantId)` supports bounded publication history by variant.
- `Publication(destinationId)` and `Publication(socialAccountId)` support operational/provider ownership lookup.
- `Publication(externalPostId)` supports provider-post reconciliation where available.
- unique `Publication.idempotencyKey` protects logical publication identity.

### Candidate CRM

- `Candidate(emailNormalized)` and `Candidate(phoneNormalized)` support deduplication lookup.
- `Candidate(updatedAt)` supports recent candidate lists.
- `Application(candidateId, updatedAt)` supports a candidate's application history.
- `Application(jobId, status)` supports job pipeline views.
- `Application(status, updatedAt)` supports lifecycle work queues.
- `Application(sourcePlatform)` / `sourceDestinationId` support source attribution analysis.
- `CandidateDocument(candidateId, createdAt)` supports candidate document history.
- `CandidateDocument(applicationId)` supports application-linked CV/document lookup.

## Decision: preserve current indexes

No application index is removed in this review.

Reasons:

1. the database has no representative business workload yet;
2. the only advisor result is an informational unused-index signal;
3. current indexes map to implemented query/domain patterns rather than speculative arbitrary columns;
4. dropping indexes before realistic data and query volume exist would optimize for an empty database and can make later hot paths slower;
5. there is no current evidence that index write/storage overhead is material.

No new application index is added either. The current advisor/stats do not identify a missing access path, and adding speculative indexes would increase write cost and maintenance without evidence.

## When to revisit indexes

Run this review again after realistic staging/production workload exists, and before production-readiness sign-off if meaningful traffic has begun.

Re-evaluate when any of these conditions is true:

- a business table grows enough that sequential scans become material;
- API/query p95 latency exceeds the product's accepted target;
- Supabase Performance Advisor reports a concrete missing/unindexed access path;
- `pg_stat_statements` shows a high-total-time or high-mean-time query on RecruitOps tables;
- `pg_stat_user_tables` shows high `seq_scan` on a large relation for a selective query pattern;
- a new feature introduces a new high-frequency `WHERE`, `JOIN`, or `ORDER BY` combination;
- provider reconciliation, commission/reconciliation, or reporting introduces materially different query shapes;
- database size/write throughput makes unused-index maintenance cost significant.

## Review method for a proposed index

For every proposed index change:

1. identify the exact application query and expected frequency;
2. reproduce the query against staging data with representative cardinality;
3. capture `EXPLAIN` / `EXPLAIN (ANALYZE, BUFFERS)` on non-sensitive staging data where safe;
4. compare planner behavior before/after the candidate index;
5. confirm the index's leading columns align with filtering/join predicates and sort pattern;
6. consider column cardinality — do not index a low-cardinality enum/boolean alone without evidence;
7. consider whether a composite or partial index better matches the query than multiple broad indexes;
8. assess write amplification/storage cost;
9. document migration and rollback behavior;
10. run Supabase advisors and repository tests after the schema change.

Never use production `EXPLAIN ANALYZE` on a mutating query or other operation that could create unsafe load/effects.

## Large-table production index changes

If a future production table is large and an index must be added or rebuilt, review PostgreSQL online/concurrent index options before deployment so normal writes are not unnecessarily blocked.

RecruitOps hosted DDL remains owned by `infra/supabase/migrations/` under the repository migration policy. A production index change must be represented in that migration history and verified against current Supabase/PostgreSQL guidance. Do not run ad-hoc production DDL simply because an advisor suggests an index.

## Query-level optimization before adding indexes

Indexes are only one performance lever. Before adding an index, also check:

- selecting only required columns;
- pagination/bounded list limits;
- N+1 query patterns;
- unnecessary relation expansion;
- correct transaction boundaries;
- cacheability where data semantics allow it;
- database connection saturation;
- repeated polling frequency;
- whether a reporting query belongs on a different aggregation/read path.

## Production-readiness gate

The current review validates **schema intent**, not production-scale performance. Production readiness still requires realistic load/data and query telemetry.

Before claiming database performance readiness:

- populate a staging dataset with representative cardinalities;
- exercise the main Job/Content, Publication, Candidate/Application, and later Commission/Reconciliation access paths;
- inspect slow/top queries and table/index statistics;
- rerun Supabase Performance Advisor;
- add/remove indexes only when those measurements justify the change;
- record any accepted latency/capacity limits.

## Current conclusion

The hosted database is structurally indexed for the application's known access paths, but it has no representative business rows yet. The technically correct action today is **no index migration**: preserve the current intentional indexes, avoid optimizing against empty-table statistics, and repeat the review once realistic workload data can provide meaningful planner and query evidence.
