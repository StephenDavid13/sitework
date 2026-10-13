# Sitework

Coordinate location-based jobs across sites as they move through a defined lifecycle
(Draft → Scheduled → In Progress → Completed).

- **Web:** Next.js 16 + TanStack Query + MapLibre (`apps/web`)
- **API:** .NET 10 Minimal APIs + EF Core + PostgreSQL/PostGIS (`apps/api`)
- **Infra:** AWS EKS + RDS via Terraform, deployed with Helm (`deploy/`, coming in milestones 3–5)

See [PLAN.md](PLAN.md) for the architecture, decisions and milestones.

## Prerequisites

Docker, .NET SDK 10.0.3xx, Node 24 and pnpm 10. Run `make` to list every task.

## Quick start

```bash
make setup   # restore .NET tools/packages and pnpm packages
make dev     # PostGIS + API (hot reload) + web, all together
```

| What | Where |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:5080 (also proxied at http://localhost:3000/api) |
| API docs (Scalar) | http://localhost:5080/scalar |
| OpenAPI document | http://localhost:5080/openapi/v1.json |
| Health probes | `/health/live`, `/health/ready` on the API |
| PostGIS | `localhost:55432`, database/user/password `sitework` |

## Common tasks

```bash
make test            # API tests (Testcontainers) + web tests (Vitest + MSW)
make lint            # ESLint, tsc, Prettier
make gen-api         # API changed? Regenerate openapi.json and the web client types
make contract-check  # fails if the committed contract is out of date
make db-reset        # wipe local data
```

## Layout

```
apps/api   .NET solution: src/Sitework.Api, tests/Sitework.Api.IntegrationTests
apps/web   Next.js app: src/app (routes), src/features, src/lib/api (generated client)
```
