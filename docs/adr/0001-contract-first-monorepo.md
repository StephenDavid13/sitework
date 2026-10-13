# 0001: Monorepo with a contract-first API

**Context.** The UI and API evolve together, and hand-written DTOs on both sides drift.

**Decision.** Keep everything in one repository: apps, chart, Terraform and CI. The API
generates `apps/api/openapi.json` at build time (`Microsoft.Extensions.ApiDescription.Server`).
The web app generates `src/lib/api/schema.d.ts` from it with `openapi-typescript` and calls the
API through `openapi-fetch`. Both files are committed, and CI (`make contract-check`) fails when
they're stale. JSON numbers are strict, so the contract doesn't type numbers as `number | string`.

**Consequences.** A breaking API change fails the web type check in the same PR. Problem details
carry a stable `code` extension (`stale_version`, `transition_not_allowed`, …) that the UI
branches on, so it never has to parse message text. The cost is one generate step after API
changes (`make gen-api`).
