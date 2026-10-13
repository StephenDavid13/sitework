# Sitework on AWS: Terraform runbook

Four root modules, applied in order. Each has its own state, so the expensive part can be
destroyed between demo sessions without touching DNS delegation, images or the CI identity.

| Stack | State | Lifetime | Creates |
|---|---|---|---|
| `bootstrap` | local (`terraform.tfstate`, gitignored) | permanent | S3 state bucket `sitework-tfstate-<account>-<region>` (versioned, SSE-S3, TLS-only, `prevent_destroy`) |
| `envs/dev/foundation` | `s3://…/dev/foundation.tfstate` | permanent | Route 53 zone for the subdomain (+ NS delegation if the parent is in Route 53), ECR `sitework-api` / `sitework-web`, GitHub OIDC provider, CI role `sitework-dev-github-deploy` |
| `envs/dev/infra` | `s3://…/dev/infra.tfstate` | disposable | VPC (2 AZs, 1 NAT), EKS `sitework-dev` + managed node group, RDS PostgreSQL 17, ACM certificate, AWS WAF web ACL, SSM parameter `/sitework/dev/helm-values` |
| `envs/dev/platform` | `s3://…/dev/platform.tfstate` | disposable | AWS Load Balancer Controller, External Secrets Operator, ExternalDNS, metrics-server (each with a Pod Identity role), CloudWatch Container Insights add-on (container logs + metrics, 14-day log retention), namespace `sitework` + CI RBAC |

All state uses S3 native locking (`use_lockfile = true`); there is no DynamoDB table.

## Prerequisites

- Terraform >= 1.11.1 from `hashicorp/tap` (the Homebrew-core formula is frozen at 1.5.7), AWS CLI v2, kubectl, Helm 4.
- AWS credentials for the target account with admin-level rights (`aws sts get-caller-identity` must work).
- **The account must be on the Paid plan.** Free-plan accounts can only launch Free Tier instance types, so the EKS node group never gets nodes. It sits in `CREATING`, with `RunInstances` failing in CloudTrail ("not eligible for Free Tier"). Upgrade in Billing → plan; any remaining credits still apply.
  Whoever applies `infra` becomes a cluster admin through an EKS access entry; use the same identity for `platform`.
- Region defaults to `ap-southeast-2`; override with `AWS_REGION=...` on any target.

## First-time setup

1. **Check for an existing GitHub OIDC provider.** AWS allows one per URL per account:

   ```sh
   aws iam list-open-id-connect-providers
   ```

   If an ARN ending in `oidc-provider/token.actions.githubusercontent.com` is listed, put it in
   `github_oidc_provider_arn`; otherwise leave it `null` and Terraform creates it.

2. **Configure foundation:**

   ```sh
   cp deploy/terraform/envs/dev/foundation/terraform.tfvars.example deploy/terraform/envs/dev/foundation/terraform.tfvars
   # set subdomain, parent_zone_id, github_repository, github_oidc_provider_arn
   ```

3. **Apply, in order:**

   ```sh
   make tf-bootstrap          # once per account/region
   make tf-apply-foundation
   ```

4. **Delegate the subdomain** if the parent domain is *not* a Route 53 zone in this account
   (with `parent_zone_id` set, Terraform already did it). Add one NS record for the subdomain at
   your DNS provider with the four values from:

   ```sh
   terraform -chdir=deploy/terraform/envs/dev/foundation output name_servers
   dig NS sitework.example.com +short   # wait until these come back
   ```

   Do this before `infra`: the ACM certificate is DNS-validated in this zone and the apply waits
   for validation.

5. **Bring up the environment:**

   ```sh
   make tf-apply-infra        # ~20 min (EKS + RDS)
   make tf-apply-platform     # ~5 min
   make kubeconfig && kubectl get nodes
   ```

6. **Wire up CI.** The deploy job in `.github/workflows/ci.yml` is skipped until the repository
   variable `AWS_DEPLOY_ROLE_ARN` is set:

   ```sh
   gh variable set AWS_DEPLOY_ROLE_ARN --repo StephenDavid13/sitework \
     --body "$(terraform -chdir=deploy/terraform/envs/dev/foundation output -raw ci_role_arn)"
   ```

   On every push to `main` (after all checks pass) the job assumes the role, builds arm64 images,
   pushes them to ECR tagged with the commit SHA, runs `make aws-deploy` (which reads
   `/sitework/dev/helm-values` from SSM and runs `helm upgrade --install … --wait
   --rollback-on-failure`), then smoke-tests `https://<subdomain>/api/status`. To deploy a commit by
   hand: `make kubeconfig && IMAGE_TAG=<sha> make aws-deploy`.

   **If an organization policy blocks GitHub OIDC providers** (an SCP denying
   `iam:*OpenIDConnectProvider*`), set `enable_github_deploy = false` in
   `foundation/terraform.tfvars`. Terraform then skips the provider, the CI role and its EKS
   access entry. CI still runs every check on every push, but releases run from a workstation
   with AWS credentials, Docker and `make kubeconfig`:

   ```sh
   make aws-release   # build arm64 images for HEAD, push to ECR, migrate + helm upgrade
   ```

   This is the setup for the `dev` account (217668541607), whose organization blocks OIDC
   providers.

### What CI can do

The role trusts only `repo:<github_repository>:ref:refs/heads/main` with audience `sts.amazonaws.com`.
A job that sets `environment:` gets a different `sub` claim and will be refused. In AWS it can
push/pull the two ECR repositories, describe the `sitework-dev` cluster and read the one SSM
parameter. In Kubernetes it is in group `sitework-deployers`, which has no cluster-wide rights and
is bound to the `sitework-deployer` Role in namespace `sitework` only (Deployments, Services,
ConfigMaps, Secrets, ServiceAccounts, Jobs, Ingresses, HPAs, PDBs, StatefulSets,
SecretStores/ExternalSecrets, plus read access to Pods, logs, ReplicaSets and Events).

## Teardown (between demo sessions)

Order matters. The Load Balancer Controller creates the ALB and its security groups, and
ExternalDNS creates the DNS records. Neither is in Terraform state, so remove the app while the
controllers are still running:

```sh
helm uninstall sitework -n sitework --wait   # controller deletes the ALB and target groups
sleep 120                                    # ExternalDNS (policy=sync, 1m interval) removes its records
aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName'   # should be empty
make tf-destroy-platform
make tf-destroy-infra
```

`foundation` stays, so the zone, its delegation, the images and the CI role survive. To come back,
run `make tf-apply-infra tf-apply-platform` and re-run the deploy workflow. The database is
recreated empty (no final snapshot), so reseed it.

Always destroy `platform` before `infra`. If the cluster disappears first, Helm releases can no
longer be deleted cleanly, and an orphaned ALB or security group blocks VPC deletion. Clean those
up in the console, or with `aws elbv2 delete-load-balancer` and `aws ec2 delete-security-group`,
then retry.

## Cost (approximate, on-demand, ap-southeast-2)

| While running | ~US$/month |
|---|---|
| EKS control plane | 73 |
| 2 × t4g.medium nodes + 2 × 20 GB gp3 | 65 |
| NAT gateway (+ data processing) | 45+ |
| ALB (created by the app's Ingress) | 20–25 |
| RDS db.t4g.micro + 20 GB gp3 | 22 |
| Public IPv4 addresses (NAT, ALB) | 11 |
| KMS key (EKS secrets), Secrets Manager secret | 2 |
| CloudWatch Container Insights metrics + container logs (small cluster) | 5–15 |
| AWS WAF (web ACL + 4 rules, + US$0.60/M requests) | 9 |
| **Total** | **~250–275 (≈ US$8–9 per day)** |

Torn down to `foundation` only, it is roughly US$1/month: the hosted zone (US$0.50), ECR storage
and state bucket storage. Destroy `infra` whenever you are not demoing.

## Accepted dev trade-offs

These are deliberate for a single dev environment and should change for anything long-lived:

- **Public EKS API endpoint**, open to `0.0.0.0/0` by default because GitHub-hosted runners have
  no fixed IPs. Access still needs IAM credentials plus an access entry. Narrow it with
  `cluster_endpoint_public_access_cidrs` in `infra`.
- **Single NAT gateway**: if its AZ fails, private subnets lose egress.
- **Single-AZ RDS** with 1-day backups, no final snapshot and no deletion protection, so
  `terraform destroy` deletes the data.
- **SSE-S3 (not a customer-managed KMS key)** for the state bucket.
- **EKS `upgrade_policy = STANDARD`**: the cluster never bills for extended support; EKS upgrades
  the control plane when standard support ends (1.37: 2027-12-01). Upgrade one minor at a time by
  bumping `kubernetes_version` in `infra`.

`make tf-scan` runs `trivy config` at HIGH/CRITICAL. The findings above are suppressed with inline
`#trivy:ignore:<ID>` comments next to the code they apply to (`bootstrap/main.tf`,
`envs/dev/infra/eks.tf`), each with its reason. That way they apply however trivy is invoked and
only to that resource or module. Remaining MEDIUM/LOW findings (control-plane log types, flow logs,
RDS IAM auth/backups/deletion protection, CMKs for ECR) are the same trade-offs.

## Notes

- **Bootstrap state** is local and gitignored. If it is lost, nothing breaks; the bucket keeps
  `prevent_destroy`. To manage it again, re-import:
  `terraform -chdir=deploy/terraform/bootstrap import aws_s3_bucket.state sitework-tfstate-<account>-<region>`
  (plus the other `aws_s3_bucket_*` resources).
- **Helm values from Terraform**: `infra` writes `/sitework/dev/helm-values` with `image.registry`,
  `ingress.host`, `ingress.certificateArn`, `database.host`,
  `database.externalSecret.{secretArn,region}` and `api.trustedProxyNetworks`, so nothing
  account-specific is committed.
- **Database credentials**: RDS generates the master password in Secrets Manager and rotates it
  (every 7 days by default). The External Secrets Operator role can read only that one secret.
  The ExternalSecret refreshes every 5 minutes, the chart mounts the password as a file (which
  Kubernetes updates in place), and the API re-reads that file every 5 minutes for new
  connections, so a rotation needs no restart. Expect at most ~10 minutes in which brand-new
  connections could fail after a rotation; existing pooled connections are unaffected.
- **Pod readiness gates** are enabled on the `sitework` namespace, so pods turn Ready only once
  the ALB sees them healthy. That makes `helm --wait` and rolling updates zero-downtime.
- **Versions** are pinned in `versions.tf` (providers, `~>` on the minor), the module blocks
  (`~>` on the minor) and `platform`'s `chart_versions` variable (exact). `.terraform.lock.hcl`
  files hold hashes for linux and darwin (amd64 and arm64) and are committed.
