# Data Migration Runbook

## Current State and Inventory
- **Data sources**
  - Operational configuration is stored in `backend/config.json` and loaded by the Flask app at startup. The configuration covers PID tuning, DM556 drive settings, GPIO pins, PWM channels, and extruder sequencing flags. These values are not versioned or persisted anywhere else.
  - Process telemetry and status events are written to timestamped CSVs under `logs/` by `backend.logger.DataLogger`, which writes headers such as `Timestamp`, temperatures (`T1_Feed`, `T2_Mid`, `T3_Nozzle`, `T_Motor`), targets, and RPM readings.
- **Gaps**
  - There is no database in the codebase today; everything is file-based. Introducing a database requires new schema and migration/ingestion from existing CSV history.

## Target Schema (backward-compatible)
1. **Configurations**
   - `config_profiles` table to store full JSON blobs from `config.json` with metadata (`profile_name`, `version`, `created_at`).
   - `config_applied_events` table to record when a profile is activated on hardware (`profile_id`, `applied_by`, `applied_at`).
2. **Runs and telemetry** (mapping directly from logger headers)
   - `runs` table: `id`, `started_at`, `status`, optional `config_profile_id` foreign key.
   - `run_samples` table: `id`, `run_id`, `recorded_at`, `t1_feed`, `t2_mid`, `t3_nozzle`, `t_motor`, `target_z1`, `target_z2`, `pwr_z1_pct`, `pwr_z2_pct`, `rpm_main`, `rpm_feed`.
   - `logger_events` table for structured warnings/errors emitted by `DataLogger._emit_event`.
3. **Compatibility choices**
   - Preserve CSV logging during migration to avoid interrupting the current workflows.
   - Default values mirror the existing CSV headers; nullable columns accept missing or non-numeric values observed in historical files.

## Migration Plan
1. **Pre-checks**
   - Verify PostgreSQL connectivity and version (`psql --version`), available disk space, and WAL retention.
   - Confirm the application can reach the DB host from staging (simple `psql` connection test using the app’s credentials).
   - Snapshot existing `logs/` directory size to estimate ingestion time.
2. **Backups**
   - File-based: archive `backend/config.json` and current `logs/` directory with timestamped tarballs.
   - Database: enable daily logical backups in staging/production; ensure PITR (Point-in-Time Recovery) on production.
3. **Dry-run (staging)**
   - Create the target schema in staging via migration tooling (e.g., Alembic or sql files checked into `deployment/migrations/`).
   - Run an ingestion script that parses a copy of CSVs into `runs` and `run_samples`, logging rejected rows.
   - Validate row counts vs. CSV line counts and spot-check sample values.
   - Keep CSV logging enabled and compare a live run’s CSV vs. DB inserts for consistency.
4. **Application changes**
   - Introduce DB connection config (environment-driven) while leaving CSV writes untouched.
   - Add dual-write for new telemetry so CSV and DB stay in sync during the transition.
   - Add feature flag to disable DB writes if issues arise.
5. **Rollback strategy**
   - If migration or ingestion fails: drop staging tables and restore from tarball as needed; toggle feature flag to disable DB writes.
   - In production, rely on PITR to revert DB state and keep CSV logging as the authoritative source until DB is stable.
6. **Cutover and monitoring**
   - After successful staging dry-run, schedule production maintenance window (off-peak hours) for schema creation and initial ingestion.
   - Monitor DB health (connections, replication lag, disk) and application logs for `DataLogger` error events post-cutover.
   - Validate by comparing a sample CSV file to DB row counts and by retrieving the latest run from `runs`/`run_samples`.

## Execution Checklist
- [ ] Pre-checks completed in staging (connectivity, disk, WAL, file inventory)
- [ ] Staging schema applied
- [ ] Staging ingestion completed and validated
- [ ] Dual-write enabled behind feature flag
- [ ] Production backup confirmed (config + logs + DB PITR)
- [ ] Production schema applied during window
- [ ] Production ingestion completed
- [ ] Post-cutover validation (CSV vs. DB parity) and monitoring enabled

## Scheduling Notes
- **Staging**: execute immediately after code changes merge; expect 1–2 hours including ingestion verification.
- **Production**: schedule during lowest traffic (e.g., local night shift); allocate 2–3 hours with on-call engineer available for rollback decisions.
