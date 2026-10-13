# 0004: Migrations as a Helm hook using the API image

**Context.** Running EF migrations at app startup races across replicas and couples schema
changes to pod restarts. A separate migration-bundle image is one more artifact to build and
version.

**Decision.** The API image accepts one-shot commands:

- `--migrate`: apply migrations, then seed demo data if configured and the database is empty.
- `--reset-demo-data`: wipe the jobs and reseed.

Each exits 0 or 1. Helm runs `--migrate` as a `pre-install,pre-upgrade` hook Job. The External
Secrets objects it depends on are lower-weight hooks. It fails fast on a wrong database name
rather than creating a new database.

**Consequences.** Every release migrates exactly once, before new pods start. A failed migration
fails the upgrade, and `--rollback-on-failure` restores the previous release. Migrations must be
backward compatible with the previous release (expand → contract), because rollbacks don't undo
schema changes.
