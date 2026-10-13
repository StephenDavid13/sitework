# Local Kubernetes (kind)

Runs the real Helm chart (`deploy/helm/sitework`) on a local kind cluster, behind Traefik, with an
in-cluster PostGIS. It exercises what the AWS deploy does (migration hook, probes, hardened pods,
same-origin Ingress routing) without an AWS account.

```
http://sitework.localhost:8080 ─► kind node :30080 ─► Traefik ─┬─ /api, /scalar, /openapi ─► sitework-api ─► postgis
                                                              └─ /                      ─► sitework-web
```

## Prerequisites

Docker, kind, kubectl, Helm 4, and for linting kubeconform and trivy. Host port 8080 must be free.

## Run it

```bash
make kind-up       # cluster "sitework" (if missing) + Traefik + PostGIS
make kind-images   # docker build sitework-api:local and sitework-web:local
make kind-load     # copy both images into the kind node
make kind-deploy   # helm upgrade --install with values-local.yaml (runs the migration hook)
make kind-smoke    # curl the app through the ingress
```

`make kind-all` runs all five. Then open http://sitework.localhost:8080 (API docs at `/scalar/`).

After a code change, run `make kind-images kind-load kind-deploy`. The image IDs are passed to
the chart as pod annotations, so a rebuilt `:local` tag rolls the pods.

`make kind-down` deletes the cluster.

## Chart checks

```bash
make helm-lint   # helm lint + kubeconform (K8s 1.37 + External Secrets CRD schemas), local and AWS values
make helm-scan   # trivy config, HIGH/CRITICAL: chart defaults plus rendered local and AWS manifests
```

The AWS checks use `deploy/helm/sitework/ci/aws-test-values.yaml`, which has dummy values for the
keys Terraform writes to SSM.

## What's where

| File | Purpose |
|---|---|
| `kind-config.yaml` | Single node (Kubernetes 1.37, matching EKS), host `127.0.0.1:8080` → node port 30080 |
| `traefik-values.yaml` | Official Traefik chart (version pinned in `local.mk`): NodePort 30080, IngressClass `traefik` |
| `postgis.yaml` | Namespace `sitework` (Pod Security `restricted` enforced), Secret `sitework-db`, PostGIS 17 |
| `local.mk` | The make targets above, included from the root `Makefile` |

## Good to know

- All targets pass `--context kind-sitework` / `--kube-context kind-sitework`, so they never touch
  another cluster, even if your current kubectl context is EKS.
- PostGIS uses an `emptyDir`, so data lasts as long as the pod. The migration hook recreates the
  schema and seeds the demo jobs on the next `make kind-deploy`.
- The migration Job is a Helm hook that is deleted when it succeeds. To see what it did:
  `kubectl --context kind-sitework -n sitework get events --field-selector involvedObject.name=sitework-migrations`.
  A failed Job is kept, and `--rollback-on-failure` restores the previous release:
  `kubectl --context kind-sitework -n sitework logs job/sitework-migrations`.
- Reset the demo data: `kubectl --context kind-sitework -n sitework rollout restart deployment/postgis`, then `make kind-deploy`.
- `*.localhost` resolves to loopback in browsers and curl. If another tool can't resolve it, add
  `127.0.0.1 sitework.localhost` to `/etc/hosts`.
