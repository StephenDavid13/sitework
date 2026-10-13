# Architecture decision records

Short records of the decisions that shape Sitework: what was decided, why, and what it costs.

| # | Decision |
|---|---|
| [0001](0001-contract-first-monorepo.md) | Monorepo with a contract-first API |
| [0002](0002-server-driven-lifecycle.md) | The server owns the lifecycle; optimistic concurrency on `xmin` |
| [0003](0003-postgis-geometry.md) | PostGIS `geometry` with spheroid distance functions |
| [0004](0004-migrations-as-helm-hook.md) | Migrations as a Helm hook using the API image |
| [0005](0005-database-credentials.md) | RDS-managed password → External Secrets → mounted file |
| [0006](0006-terraform-stacks-by-lifetime.md) | Four Terraform stacks split by lifetime |
| [0007](0007-e2e-on-kind.md) | End-to-end tests against the real chart on kind |
| [0008](0008-no-auth-yet.md) | No logins yet: rate limiting instead |
