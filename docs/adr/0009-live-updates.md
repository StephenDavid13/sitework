# 0009: Live updates via server-sent events, fanned out by Postgres LISTEN/NOTIFY

**Context.** Coordinators work on the same jobs at the same time. Without live updates, a list or
job page shows stale data until someone refreshes. The API runs as several replicas, so an
in-memory pub/sub on one pod wouldn't reach browsers connected to another.

**Decision.**

- **Source of events:** a trigger on `jobs` calls `pg_notify('job_changes', {id, op, status})`
  for every insert, update and delete. NOTIFY is delivered on commit and covers writes made
  outside the API, such as `--reset-demo-data`.
- **Fan-out:** each API pod runs a `BackgroundService` that LISTENs on a dedicated connection
  from the shared data source (so it uses the rotating password too). It hands each change to an
  in-memory broadcaster, with one bounded queue per subscriber that drops its oldest events.
- **Delivery:** `GET /api/events` streams `job` events (and a `ping` every 20 s) with .NET 10's
  `TypedResults.ServerSentEvents`. Streams end on client disconnect or pod shutdown.
- **Recovery:** after the listener reconnects it sends `resync`, because events during the gap
  were lost.
- **Client:** one `EventSource` per tab. It batches events for 250 ms, then invalidates the
  affected TanStack Query keys. Edit forms work on a snapshot and show a "changed elsewhere"
  notice rather than overwriting unsaved input.

**Consequences.** No extra infrastructure (no Redis, no message broker). Events are hints to
refetch, never data, so a dropped event costs freshness, not correctness. Each tab holds one
long-lived connection: the ALB's HTTP/2 multiplexes them, and the 20 s ping keeps them inside its
idle timeout.
