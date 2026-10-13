# Operations runbook

Day-2 operations for the `dev` environment on EKS. Setup and teardown are in
[deploy/terraform/README.md](../deploy/terraform/README.md).

```bash
make kubeconfig                       # kubectl context for sitework-dev
kubectl -n sitework get pods,ingress,hpa,pdb
helm -n sitework history sitework
```

## Deploying

- **Normal path:** merge to `main`. CI runs every check, builds arm64 images tagged with the commit SHA, pushes them to ECR, then runs `make aws-deploy`. That runs `helm upgrade --wait --rollback-on-failure`, with migrations first as a pre-upgrade hook. Finally CI smoke-tests `https://<host>/api/status`.
- **From a workstation.** Where the AWS organization blocks GitHub OIDC, CI can't deploy. This applies to the current `dev` account. After the pipeline is green, release `HEAD` (which needs a clean working tree):

  ```bash
  aws login --region ap-southeast-2 && make kubeconfig
  make aws-release   # build arm64 images, push to ECR (immutable SHA tags), migrate, helm upgrade
  ```

- **By hand**, for an image that's already pushed:

  ```bash
  IMAGE_TAG=<git sha> make aws-deploy
  ```

- **Config-only changes** (values, limits) go through the same path. Never `kubectl edit` resources that Helm owns.

## Rolling back

```bash
helm -n sitework history sitework
helm -n sitework rollback sitework <revision> --wait
```

A failed `helm upgrade` already rolls itself back (`--rollback-on-failure`). Database migrations
only go forward, so schema changes must be backward compatible with the previous release
(expand → deploy → contract):

1. Add new columns or tables in one release.
2. Start using them in the next.
3. Drop the old ones in a later release.

A rollback then never meets a schema it can't read.

## Migration hook failed

The hook Job is kept on failure (and deleted on success):

```bash
kubectl -n sitework logs job/sitework-migrations
kubectl -n sitework get events --field-selector involvedObject.name=sitework-migrations
```

The release was rolled back automatically. Fix the cause and redeploy:

- **Connection errors:** check that the External Secret synced (`kubectl -n sitework get externalsecret`) and that the RDS security group allows the node security group.
- **A bad migration:** revert it in a new commit.

## Logs, metrics and traces

- **Logs:** pods write JSON to stdout, and Fluent Bit ships it to CloudWatch Logs `/aws/containerinsights/sitework-dev/application`, kept for 14 days. A Logs Insights starting point:

  ```
  fields @timestamp, kubernetes.container_name as container, log_processed.LogLevel as level,
         log_processed.Message as message, log_processed.Exception as exception
  | filter container = "api" and level in ["Error", "Critical"]
  | sort @timestamp desc
  | limit 100
  ```

  Every API error response carries a `traceId` (problem details) that appears in the matching log entry.
- **Metrics:** CloudWatch → Container Insights (CPU/memory per pod, restarts, node health).
- **Traces and app metrics:** on EKS the API exports OTLP (HTTP) to the CloudWatch agent (`cloudwatch-agent.amazon-cloudwatch:4316`), which forwards traces to X-Ray. Look in CloudWatch → X-Ray traces / Application Signals, service `sitework-api`. Traces cover HTTP in and out plus SQL; metrics cover HTTP, runtime and the connection pool. Point `api.telemetry.otlpEndpoint` at any other collector to send them elsewhere.
- **Quick checks:** `https://<host>/api/status` (version, environment, database health), and `/status` in the UI.

## Live updates

Browsers hold one server-sent-events connection (`/api/events`) per tab. A trigger on `jobs`
emits `pg_notify`. Every API pod LISTENs and forwards the event, and clients refetch what changed.

- **Health:** the header shows "Live" while the stream is connected, and "Reconnecting live updates" otherwise. EventSource retries on its own.
- **Proxies** must not buffer the stream. The API sends `X-Accel-Buffering: no` and a ping every 20 s, which keeps it under the ALB's 60 s idle timeout.
- **Many tabs:** over plain HTTP/1.1, browsers allow 6 connections per host, and each tab's stream holds one. The ALB serves HTTP/2, which multiplexes, so this only matters locally.
- If the listener's database connection drops, it reconnects with backoff and tells clients to refetch everything (`resync`). Look for "Lost the job-change listener connection" in the logs.

## Address search

The API proxies [Photon](https://photon.komoot.io), OpenStreetMap data under the ODbL. The UI
shows the attribution.

- Results are cached in memory for 24 hours.
- Clients are limited to 60 lookups per minute per IP.
- Upstream failures return a `503` with `code: geocoding_unavailable`. The form keeps working: drop a pin or type coordinates instead.
- Heavy use belongs on your own Photon instance. Set `Geocoding__BaseUrl` (via `api.extraEnv`).

## WAF

The web ACL (`sitework-dev`, enabled by default) blocks a client IP above 3,000 requests per 5
minutes. It also applies AWS managed rules: IP reputation, known-bad inputs and the common rule set.

- **Metrics and sampled requests:** WAF console → Web ACLs → `sitework-dev`.
- **False positive** (a legitimate request blocked): find the rule in the sampled requests. Override that one rule to `count` in `deploy/terraform/envs/dev/infra/waf.tf`, then re-apply `infra`.
- **Turn it off:** `enable_waf = false`, then re-apply `infra` and redeploy. The annotation disappears with the SSM value.

## Scaling

- **Pods:** the HPA scales the API and web from 2 to 4 replicas each on CPU. Change `api.autoscaling` and `web.autoscaling` in `values-aws.yaml`.
- **Nodes:** the managed node group is 2–4 nodes of `node_instance_types` (m7i-flex.large in `deploy/terraform/envs/dev/infra/terraform.tfvars`, t4g.medium by default). Change `desired_size` and `max_size` in `deploy/terraform/envs/dev/infra/eks.tf`.
- **Database:** db.t4g.micro. Change the instance class in `infra/rds.tf`. This restarts the instance, so do it in a quiet window.

## Rate limits (public site, no logins)

Per client IP: 600 requests and 60 writes per minute. Over the limit, clients get `429` with
`Retry-After`. To tune, set `api.rateLimiting.requestsPerMinute` or `writesPerMinute`. To restrict
the whole site to known IPs, for example during a demo, set `ingress.inboundCidrs`.

## Database credentials

RDS rotates the master password every 7 days, and no action is needed:

1. External Secrets refreshes the Kubernetes Secret within 5 minutes.
2. Kubernetes updates the mounted file.
3. The API re-reads it within 5 minutes for new connections.

To rotate right away and verify:

```bash
aws secretsmanager rotate-secret --secret-id "$(helm -n sitework get values sitework -o json | jq -r .database.externalSecret.secretArn)"
kubectl -n sitework annotate externalsecret sitework-db force-sync=$(date +%s) --overwrite
curl -s https://<host>/api/status   # "database":"Healthy"
```

## Demo data

```bash
make aws-reset-demo-data   # wipes all jobs and reseeds the Auckland demo set
```

## DNS

ExternalDNS publishes `sitework.stephendavid.dev` as an alias to the ALB in the Ingress status.
Next to it, it writes ownership TXT records (`_externaldns-a.…` and `_externaldns-aaaa.…`,
owner `sitework-dev`). It only updates or deletes records that carry them.

- **Check:** `kubectl -n external-dns logs deploy/external-dns`. A healthy sync logs `Desired change: CREATE …` once, then `All records are already up to date`.
- **The name resolves to nothing, or to an old ALB, and the logs say "up to date":** the A/AAAA records exist without ownership TXT records, so ExternalDNS won't touch them. This happens to records created before the TXT prefix was set, because the apex name's TXT fell outside the zone. Compare `aws route53 list-resource-record-sets --hosted-zone-id <zone>` with `kubectl -n sitework get ingress`. Delete the stale A and AAAA aliases, and ExternalDNS recreates them, with their TXT records, within a minute.

## Incident checklist

| Symptom | Look at |
|---|---|
| 502/503 from the ALB | `kubectl -n sitework get pods` (Ready?), readiness probe failures in events, ALB target health in the console |
| API 5xx | CloudWatch Logs query above; `/api/status` database health; RDS CPU/connections |
| Site doesn't resolve, or resolves to an old ALB | [DNS](#dns): ExternalDNS logs, then the zone's A/AAAA and `_externaldns-*` TXT records |
| "Database unavailable" in the UI | RDS status and events; External Secret sync status; security groups |
| Many 429s | A single IP hammering the site? Tighten with `inboundCidrs`, or raise limits if legitimate |
| Deploy job fails at `configure-aws-credentials` | `AWS_DEPLOY_ROLE_ARN` repo variable; the workflow must run on `main` with no `environment:` |
