# 0006: Four Terraform stacks split by lifetime

**Context.** The expensive parts (EKS, NAT, RDS) should be destroyed between demos. DNS
delegation, images and the CI identity shouldn't change when they are. Configuring the
Kubernetes/Helm providers against a cluster created in the same apply is also fragile.

**Decision.**

| Stack | Lifetime | Contents |
|---|---|---|
| `bootstrap` | permanent | State bucket (local state) |
| `foundation` | permanent | Route 53 subdomain zone, ECR, GitHub OIDC deploy role |
| `infra` | disposable | VPC, EKS, RDS, ACM certificate; writes the Helm values to SSM |
| `platform` | disposable | Cluster add-ons and the app namespace RBAC |

The stacks read each other through remote state. State uses S3 native locking (no DynamoDB).

**Consequences.** Teardown is `helm uninstall`, then destroy `platform`, then `infra` (about
US$1/month while down). Nothing account-specific is committed: CI reads the Helm values from SSM.
