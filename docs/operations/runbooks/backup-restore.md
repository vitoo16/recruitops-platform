# Backup and Restore Runbook

## Purpose

This runbook defines RecruitOps backup, restore, and recovery verification for the current free-tier topology:

- PostgreSQL/Auth/Storage metadata: Supabase project `recruitops-platform` in Singapore (`ap-southeast-1`);
- private CV/content media objects: Supabase Storage, including the private `recruitops-private` bucket;
- frontend/API/Redis runtime: Render; these services are rebuilt from repository configuration and environment settings rather than treated as durable backup sources.

The durable recovery set is **database + Storage objects + repository migrations/configuration + separately managed secrets**. A database dump alone is not a complete RecruitOps backup because Supabase database backups contain Storage metadata but not the object bytes stored by the Storage service.

## Recovery objectives for the current free-tier stage

The current project does not claim paid-plan PITR or a guaranteed managed-backup RPO. Until a paid recovery tier is intentionally enabled, RecruitOps uses an operator-created logical backup before risky data/schema operations and on a regular operational cadence.

Target operating objectives for this stage:

- **RPO:** latest successfully verified manual backup; take a fresh backup before migrations, bulk imports, destructive maintenance, or recovery-sensitive releases.
- **RTO:** best effort; restore to a new healthy Supabase project rather than attempting undocumented in-place recovery.
- **Retention:** keep at least the latest three verified backup sets in an encrypted location outside the Supabase project being protected.

These are RecruitOps operating targets, not guarantees from the Free plan.

## What a backup set contains

Create one timestamped directory per backup set:

```text
recruitops-backup-YYYYMMDDTHHMMSSZ/
├── database/
│   ├── roles.sql
│   ├── schema.sql
│   ├── data.sql
│   ├── migration-history-schema.sql
│   └── migration-history-data.sql
├── storage/
│   └── <bucket object tree>
├── manifest.txt
└── verification.txt
```

Never place production database URLs, passwords, Supabase secret/service-role keys, S3 access keys, OAuth tokens, or encryption keys inside the backup directory or repository. Store backup credentials in the operator's approved secret manager and inject them only for the command that needs them.

## Preconditions

Before backup or restore:

1. Verify the target/source Supabase project identity and region.
2. Obtain a current database connection string from **Connect** in the Supabase dashboard. Prefer the Session pooler when direct IPv6 connectivity is unavailable.
3. Have a current Supabase CLI and `psql` available. Discover current CLI flags with `supabase --help` / `supabase db --help`; do not rely on stale local syntax.
4. For Storage object export/import, use a supported Supabase Storage method such as the CLI or an S3-compatible client. For bulk object copies, prefer the S3-compatible path when enabled.
5. Ensure the backup destination is encrypted and outside the source Supabase project.
6. For a restore drill, use a disposable/non-production target project unless responding to a real incident.

## Database backup

Supabase's current CLI migration guidance separates roles, schema, and data. With the source connection string available only in the current shell as `SOURCE_DB_URL`:

```bash
mkdir -p "$BACKUP_DIR/database"

supabase db dump --db-url "$SOURCE_DB_URL" \
  -f "$BACKUP_DIR/database/roles.sql" \
  --role-only

supabase db dump --db-url "$SOURCE_DB_URL" \
  -f "$BACKUP_DIR/database/schema.sql"

supabase db dump --db-url "$SOURCE_DB_URL" \
  -f "$BACKUP_DIR/database/data.sql" \
  --use-copy \
  --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"
```

Preserve Supabase CLI migration history separately when present:

```bash
supabase db dump --db-url "$SOURCE_DB_URL" \
  -f "$BACKUP_DIR/database/migration-history-schema.sql" \
  --schema supabase_migrations

supabase db dump --db-url "$SOURCE_DB_URL" \
  -f "$BACKUP_DIR/database/migration-history-data.sql" \
  --use-copy \
  --data-only \
  --schema supabase_migrations
```

If a command or exclusion changes in the installed Supabase CLI, stop and use that version's `--help` plus current Supabase documentation rather than guessing an equivalent flag.

## Storage object backup

Postgres contains `storage.buckets` / `storage.objects` metadata, but the actual object bytes are separate and must be copied independently.

For the RecruitOps private bucket, export the full object tree to the backup set using a supported authenticated Storage path. Current Supabase documentation supports:

- Supabase CLI Storage copy commands; or
- an S3-compatible client after enabling Storage S3 access and generating dedicated credentials.

The operator must confirm that the exported object count and total bytes are plausible for every protected bucket. At minimum protect `recruitops-private`; include any later durable bucket added by the application.

Do **not** commit exported CVs/media or Storage credentials to Git.

## Backup verification

A backup is not considered successful only because dump commands exited with zero.

Record these checks in `verification.txt`:

1. all expected SQL files exist and are non-empty where applicable;
2. database dump commands exited successfully;
3. protected Storage buckets were enumerated;
4. object export completed and object count was recorded;
5. backup directory checksum/manifest was generated;
6. no secret values were copied into `manifest.txt` or `verification.txt`;
7. for scheduled recovery drills, restore the set into an isolated project/database and run the restore verification section below.

A simple local manifest can be generated without including credentials:

```bash
find "$BACKUP_DIR" -type f -print0 \
  | sort -z \
  | xargs -0 sha256sum > "$BACKUP_DIR/manifest.txt"
```

Generate the manifest only after all backup files have been written.

## Restore strategy

Prefer restore into a **new Supabase project**. This keeps the damaged/source project available for comparison and avoids destructive in-place experimentation.

The new target must be configured deliberately. A database restore does not automatically reproduce every project-level setting, Storage object byte, Edge Function, API key, custom domain, Auth setting, Realtime setting, or external integration credential.

### 1. Prepare the target

- create or select the approved target project;
- confirm target project identity before writing anything;
- obtain its database connection string as `TARGET_DB_URL`;
- ensure required Postgres extensions/settings are compatible;
- keep application traffic pointed at the old environment until verification is complete.

### 2. Restore database content

Follow current Supabase restore guidance and use `psql` with fail-fast behavior for the logical dump files. The exact ordering/flags must match the current Supabase guide and the dump format used by the backup.

For migration history exported separately, Supabase documents a single-transaction restore pattern:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/migration-history-schema.sql" \
  --file "$BACKUP_DIR/database/migration-history-data.sql" \
  --dbname "$TARGET_DB_URL"
```

For the primary roles/schema/data files, use the current Supabase backup/restore guide for the selected target type. Do not ignore restore errors unless the current Supabase documentation explicitly describes them as expected for that restore mode.

### 3. Restore Storage objects

After database metadata is present, copy the protected object bytes into the corresponding target buckets using the Supabase CLI or S3-compatible path.

Do not assume that seeing rows in `storage.objects` means files were restored: object metadata can exist while the underlying Storage object is absent.

### 4. Restore non-database configuration

Review and reconfigure as applicable:

- Auth URL/settings and email provider configuration;
- Realtime settings;
- Storage bucket settings/policies;
- Edge Functions;
- Render environment variables that reference the Supabase project;
- external OAuth/provider application redirect URIs;
- encryption keyring and other secrets from the approved secret manager.

Never recover secrets by copying them from application logs or Git history.

## Restore verification

Before directing production traffic to a restored target, verify at minimum:

1. Prisma migrations/schema are compatible with the restored database.
2. API health is green using the target database.
3. authentication works with an approved test account.
4. RBAC still blocks unauthorized operations.
5. candidate/application counts and a sample of critical records match the backup expectations.
6. a protected CV can be authorized and downloaded through the application path.
7. a protected media object can be resolved through the normal server-side path.
8. public/browser access cannot read private bucket objects directly.
9. publication history/idempotency records exist; do not automatically replay historical or ambiguous publications as part of restore.
10. current CI/typecheck/test/build remain green against repository source.
11. any changed project URLs/keys are configured only after the target is accepted.

For disaster recovery, explicitly record who approved the cutover and which backup timestamp was restored.

## Failure handling and rollback

If restore verification fails:

- stop the cutover;
- keep the target isolated;
- retain restore logs that do not contain secrets;
- compare schema/migration history and object counts with the source backup;
- correct the target or create another clean target rather than repeatedly mutating an uncertain restore;
- leave application traffic on the last known-good environment when it is still available.

If the source project is unavailable, keep DNS/Render configuration unchanged until the replacement passes verification. A partially restored project must not be advertised as recovered.

## Scheduled drill

Run a non-production restore drill whenever the recovery process materially changes and periodically during production hardening. Record:

- backup timestamp;
- backup size and protected bucket counts;
- restore target identifier (non-secret);
- start/end timestamps;
- verification results;
- failures and corrective actions.

A documentation-only review is not a restore drill.

## Paid-tier upgrade path

If RecruitOps moves to a Supabase plan with managed downloadable backups or PITR, update this runbook before relying on those features. Managed database backup/PITR still does not replace a Storage object recovery strategy, and project-level configuration/secrets still require separate recovery controls.

## References

This runbook tracks Supabase's current guidance for CLI logical backup/restore, database backup scope, Storage object export, and production recovery limitations. Re-check current Supabase documentation before executing a real recovery because CLI syntax and platform capabilities can change.
