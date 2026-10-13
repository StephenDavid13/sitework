# Local Kubernetes (kind) and Helm chart targets. Included from the root Makefile, so paths are
# relative to the repo root (standalone: make -f deploy/local/local.mk <target>).
# Runbook: deploy/local/README.md
#
# Every kubectl/helm call names the kind context explicitly, so these targets never act on
# whatever cluster is current (e.g. EKS after `make kubeconfig`).

SHELL := /bin/bash

KIND_CLUSTER    ?= sitework
KIND_CONTEXT    := kind-$(KIND_CLUSTER)
KIND_CONFIG     := deploy/local/kind-config.yaml
KIND_NAMESPACE  ?= sitework
KIND_URL        ?= http://sitework.localhost:8080
KIND_API_IMAGE  ?= sitework-api:local
KIND_WEB_IMAGE  ?= sitework-web:local
KIND_KUBECTL    := kubectl --context $(KIND_CONTEXT)
KIND_HELM       := helm --kube-context $(KIND_CONTEXT)

TRAEFIK_CHART_REPO    := https://traefik.github.io/charts
TRAEFIK_CHART_VERSION := 41.7.1

HELM_RELEASE      ?= sitework
HELM_CHART        := deploy/helm/sitework
HELM_TIMEOUT      ?= 10m
HELM_LOCAL_VALUES := -f $(HELM_CHART)/values-local.yaml
# values-aws.yaml plus dummy stand-ins for the keys Terraform supplies through SSM.
HELM_AWS_VALUES   := -f $(HELM_CHART)/values-aws.yaml -f $(HELM_CHART)/ci/aws-test-values.yaml

# kubeconform: Kubernetes schemas for the EKS/kind version, plus CRD schemas (External Secrets)
# from the datree CRDs-catalog, pinned to a commit: the catalog's 2026-10-08 regeneration
# (b7e2015) emits a SecretStore schema kubeconform cannot compile ("could not find schema").
# f3e4382 = external-secrets.io CRDs 2.5.0; the v1 SecretStore/ExternalSecret fields used here
# are unchanged in the 2.12 chart the platform stack installs.
KUBECONFORM_K8S_VERSION ?= 1.37.0
CRDS_CATALOG_REF        ?= f3e4382095909ac60000da025f323ba44d4c738a
KUBECONFORM := kubeconform -strict -summary -kubernetes-version $(KUBECONFORM_K8S_VERSION) \
	-schema-location default \
	-schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/$(CRDS_CATALOG_REF)/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'

.PHONY: kind-up kind-images kind-load kind-deploy kind-smoke kind-down kind-all helm-lint helm-scan

kind-up: ## Create the kind cluster (if missing) with Traefik and PostGIS
	@if kind get clusters 2>/dev/null | grep -qx '$(KIND_CLUSTER)'; then \
		echo "kind cluster '$(KIND_CLUSTER)' already exists"; \
	else \
		kind create cluster --name $(KIND_CLUSTER) --config $(KIND_CONFIG) --wait 120s; \
	fi
	$(KIND_HELM) upgrade --install traefik traefik --repo $(TRAEFIK_CHART_REPO) \
		--version $(TRAEFIK_CHART_VERSION) --namespace traefik --create-namespace \
		-f deploy/local/traefik-values.yaml --wait --timeout 5m
	$(KIND_KUBECTL) apply -f deploy/local/postgis.yaml
	$(KIND_KUBECTL) -n $(KIND_NAMESPACE) rollout status deployment/postgis --timeout=180s

kind-images: ## Build the API and web images for kind (sitework-api:local, sitework-web:local)
	docker build -t $(KIND_API_IMAGE) apps/api
	docker build -t $(KIND_WEB_IMAGE) apps/web

kind-load: ## Load the local API and web images into the kind node
	kind load docker-image $(KIND_API_IMAGE) $(KIND_WEB_IMAGE) --name $(KIND_CLUSTER)

# The image IDs go into pod annotations so a rebuilt `:local` image rolls the pods.
kind-deploy: ## Install/upgrade the chart on kind (migration hook, then wait for rollout)
	$(KIND_HELM) upgrade --install $(HELM_RELEASE) $(HELM_CHART) \
		--namespace $(KIND_NAMESPACE) --create-namespace $(HELM_LOCAL_VALUES) \
		--set-string 'api.podAnnotations.sitework\.local/image-id'="$$(docker image inspect -f '{{.Id}}' $(KIND_API_IMAGE))" \
		--set-string 'web.podAnnotations.sitework\.local/image-id'="$$(docker image inspect -f '{{.Id}}' $(KIND_WEB_IMAGE))" \
		--wait --rollback-on-failure --timeout $(HELM_TIMEOUT)

kind-smoke: ## Smoke-test the kind deployment through the Traefik ingress
	@set -euo pipefail; \
	fetch() { curl -fsS --max-time 10 --retry 5 --retry-delay 2 --retry-all-errors "$(KIND_URL)$$1"; }; \
	status=$$(fetch /api/status); echo "GET /api/status       $$status"; \
	grep -q '"database":"Healthy"' <<<"$$status" || { echo "FAIL: database is not Healthy" >&2; exit 1; }; \
	stats=$$(fetch /api/jobs/stats); echo "GET /api/jobs/stats   $$stats"; \
	grep -Eq '"total":[1-9]' <<<"$$stats" || { echo "FAIL: no jobs (demo data not seeded?)" >&2; exit 1; }; \
	echo "GET /healthz          $$(fetch /healthz)"; \
	html=$$(fetch /jobs); grep -qi '<html' <<<"$$html" || { echo "FAIL: /jobs did not return HTML" >&2; exit 1; }; \
	echo "GET /jobs             Next.js HTML"; \
	fetch /scalar/ >/dev/null && echo "GET /scalar/          200"; \
	doc=$$(fetch /openapi/v1.json); grep -q '"openapi"' <<<"$$doc" || { echo "FAIL: no OpenAPI document" >&2; exit 1; }; \
	echo "GET /openapi/v1.json  OpenAPI document"; \
	echo "Smoke test passed: $(KIND_URL)"

kind-down: ## Delete the kind cluster
	kind delete cluster --name $(KIND_CLUSTER)

kind-all: kind-up kind-images kind-load kind-deploy kind-smoke ## Cluster, images, deploy and smoke test in one go

helm-lint: ## Lint the chart and kubeconform its manifests (local and AWS values)
	helm lint $(HELM_CHART) --strict $(HELM_LOCAL_VALUES)
	helm lint $(HELM_CHART) --strict $(HELM_AWS_VALUES)
	@set -euo pipefail; \
	echo "==> kubeconform: values-local.yaml"; \
	helm template $(HELM_RELEASE) $(HELM_CHART) -n $(KIND_NAMESPACE) $(HELM_LOCAL_VALUES) | $(KUBECONFORM); \
	echo "==> kubeconform: values-aws.yaml"; \
	helm template $(HELM_RELEASE) $(HELM_CHART) -n $(KIND_NAMESPACE) $(HELM_AWS_VALUES) | $(KUBECONFORM)

# Trivy's Helm scanner renders default values and skips hooks, so the rendered local and AWS
# manifests (migration Job and External Secrets hooks included) are scanned as well.
helm-scan: ## Scan the chart for HIGH/CRITICAL misconfigurations (trivy; defaults, local and AWS)
	trivy config --severity HIGH,CRITICAL --exit-code 1 deploy/helm
	@set -euo pipefail; dir=$$(mktemp -d); trap 'rm -rf "$$dir"' EXIT; \
	helm template $(HELM_RELEASE) $(HELM_CHART) -n $(KIND_NAMESPACE) $(HELM_LOCAL_VALUES) > "$$dir/local.yaml"; \
	helm template $(HELM_RELEASE) $(HELM_CHART) -n $(KIND_NAMESPACE) $(HELM_AWS_VALUES) > "$$dir/aws.yaml"; \
	trivy config --severity HIGH,CRITICAL --exit-code 1 "$$dir"
