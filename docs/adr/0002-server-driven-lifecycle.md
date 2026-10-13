# 0002: The server owns the lifecycle; optimistic concurrency on `xmin`

**Context.** Several coordinators can act on the same job. Status rules (which moves are allowed,
what each needs) must not be duplicated in the UI, where they would drift.

**Decision.**

- The lifecycle is a single transition table in `Domain/JobLifecycle.cs`, tested exhaustively
  (every from → to pair).
- Status changes only happen through `POST /api/jobs/{id}/transitions`.
- Every job response includes `allowedTransitions` (plus `requiresNote` and `requiresSchedule`),
  `canEdit` and `canDelete`. The UI renders exactly those.
- Writes carry the `version` the client last read, which is Postgres `xmin`. A mismatch, or a
  lost race at `SaveChanges`, returns `409 stale_version`, and the UI offers to reload.
- Every change appends to `job_status_changes` in the same transaction.

**Consequences.** Adding a status or rule is a server-only change. The UI updates optimistically
for responsiveness, but always ends up showing what the server confirms.
