SHELL := /bin/bash
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web
CONTRACT_FILES := $(API_DIR)/openapi.json $(WEB_DIR)/src/lib/api/schema.d.ts

# Local Kubernetes (kind) and AWS (Terraform) targets live next to their code.
-include deploy/local/local.mk
-include deploy/terraform/terraform.mk

.PHONY: help
help: ## List available targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# --- Setup & local dev -------------------------------------------------------

.PHONY: setup
setup: ## Install .NET tools/packages and web packages
	cd $(API_DIR) && dotnet tool restore && dotnet restore
	cd $(WEB_DIR) && pnpm install --frozen-lockfile

.PHONY: dev
dev: db-up migrate ## Run PostGIS, the API (hot reload) and the web app together
	@$(MAKE) --no-print-directory -j2 api web

.PHONY: api
api: ## Run the API on http://localhost:5080 (docs at /scalar)
	cd $(API_DIR) && dotnet watch --project src/Sitework.Api --non-interactive

.PHONY: web
web: ## Run the web app on http://localhost:3000 (proxies /api to the API)
	cd $(WEB_DIR) && pnpm dev

.PHONY: db-up
db-up: ## Start PostGIS on localhost:55432
	docker compose up -d --wait db

.PHONY: db-down
db-down: ## Stop PostGIS (data is kept)
	docker compose down

.PHONY: migrate
migrate: ## Apply database migrations and seed demo data if the database is empty
	cd $(API_DIR) && dotnet run --project src/Sitework.Api -- --migrate

.PHONY: reset-demo-data
reset-demo-data: ## Delete all local jobs and reseed the demo data
	cd $(API_DIR) && dotnet run --project src/Sitework.Api -- --reset-demo-data

.PHONY: db-reset
db-reset: ## Delete all local data and restart PostGIS
	docker compose down --volumes
	docker compose up -d --wait db

# --- API contract ------------------------------------------------------------

.PHONY: gen-api
gen-api: ## Regenerate openapi.json from the API and the web client types from it
	cd $(API_DIR) && dotnet build src/Sitework.Api --nologo --verbosity quiet
	cd $(WEB_DIR) && pnpm gen:api

.PHONY: contract-check
contract-check: gen-api ## Fail if the committed contract differs from the code
	git diff --exit-code -- $(CONTRACT_FILES)

# --- Quality gates -----------------------------------------------------------

.PHONY: test
test: test-api test-web ## Run all tests

.PHONY: test-api
test-api: ## API unit + integration tests (needs Docker for Testcontainers)
	cd $(API_DIR) && dotnet test

.PHONY: test-web
test-web: ## Web component tests
	cd $(WEB_DIR) && pnpm test

.PHONY: e2e
e2e: ## Playwright end-to-end tests (E2E_BASE_URL defaults to http://localhost:3000)
	cd $(WEB_DIR) && pnpm test:e2e

.PHONY: lint
lint: ## Lint, typecheck and format-check the web app
	cd $(WEB_DIR) && pnpm lint && pnpm typecheck && pnpm format:check

.PHONY: check
check: lint test contract-check ## Everything CI runs
	cd $(WEB_DIR) && pnpm build

# --- Deploy to EKS -----------------------------------------------------------
# CI runs `aws-deploy` after pushing images when the GitHub deploy role exists. Where an
# organization policy blocks GitHub OIDC, release from a workstation with `make aws-release`
# (needs AWS credentials, Docker and `make kubeconfig`).

HELM_RELEASE   ?= sitework
HELM_NAMESPACE ?= sitework
HELM_VALUES_PARAM ?= /sitework/dev/helm-values
GIT_SHA        := $(shell git rev-parse --short=12 HEAD 2>/dev/null)
ECR_REGISTRY    = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: aws-images
aws-images: ## Build arm64 images for the current commit and push them to ECR (clean tree only)
	@test -z "$$(git status --porcelain)" || { echo "Commit or stash your changes first: images are tagged with the commit SHA" >&2; exit 1; }
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@set -euo pipefail; for app in api web; do \
		repo=sitework-$$app; \
		if aws ecr describe-images --region $(AWS_REGION) --repository-name $$repo --image-ids imageTag=$(GIT_SHA) >/dev/null 2>&1; then \
			echo "$$repo:$(GIT_SHA) already in ECR (tags are immutable), skipping"; \
		else \
			docker buildx build --platform linux/arm64 --tag $(ECR_REGISTRY)/$$repo:$(GIT_SHA) --push apps/$$app; \
		fi; \
	done

.PHONY: aws-release
aws-release: aws-images ## Build, push and deploy the current commit to EKS
	$(MAKE) --no-print-directory aws-deploy IMAGE_TAG=$(GIT_SHA)

.PHONY: aws-deploy
aws-deploy: ## Deploy already-pushed images to EKS: IMAGE_TAG=<git sha> make aws-deploy
	@test -n "$(IMAGE_TAG)" || { echo "Set IMAGE_TAG (the pushed image tag, e.g. the git SHA)" >&2; exit 1; }
	@set -euo pipefail; values=$$(mktemp); trap 'rm -f "$$values"' EXIT; \
	aws ssm get-parameter --region $(AWS_REGION) --name $(HELM_VALUES_PARAM) --query Parameter.Value --output text > "$$values"; \
	helm upgrade --install $(HELM_RELEASE) deploy/helm/sitework --namespace $(HELM_NAMESPACE) \
		-f deploy/helm/sitework/values-aws.yaml -f "$$values" \
		--set-string image.tag=$(IMAGE_TAG) \
		--wait --rollback-on-failure --timeout 10m
	@host=$$(helm get values $(HELM_RELEASE) -n $(HELM_NAMESPACE) -o json | jq -r .ingress.host); \
	echo "Deployed $(IMAGE_TAG): https://$$host"

.PHONY: aws-reset-demo-data
aws-reset-demo-data: ## Wipe and reseed the demo data on EKS (runs inside a live API pod)
	kubectl --namespace $(HELM_NAMESPACE) exec deploy/$(HELM_RELEASE)-api -- dotnet Sitework.Api.dll --reset-demo-data
