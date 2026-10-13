# 0007: End-to-end tests against the real chart on kind

**Context.** Testing the UI against a dev server misses deployment bugs: probes, ingress
routing, security contexts, CSP, the migration hook and image contents.

**Decision.** CI creates a kind cluster with Traefik and PostGIS, builds both images, deploys
them with the production Helm chart (`values-local.yaml`), smoke-tests through the ingress, scans
the images with Trivy, and runs Playwright (desktop and mobile, with axe accessibility checks)
against `http://sitework.localhost:8080`.

**Consequences.** CI takes a few minutes longer. In exchange, a green build means the artifacts
that will be deployed actually work together. The same tests run locally against `make dev`
(`make e2e`) or kind (`E2E_BASE_URL=http://sitework.localhost:8080 make e2e`).
