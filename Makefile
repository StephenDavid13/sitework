SHELL := /bin/bash
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web
CONTRACT_FILES := $(API_DIR)/openapi.json $(WEB_DIR)/src/lib/api/schema.d.ts

.PHONY: help
help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- Setup & local dev -------------------------------------------------------

.PHONY: setup
setup: ## Install .NET tools/packages and web packages
	cd $(API_DIR) && dotnet tool restore && dotnet restore
	cd $(WEB_DIR) && pnpm install --frozen-lockfile

.PHONY: dev
dev: db-up ## Run PostGIS, the API (hot reload) and the web app together
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

.PHONY: lint
lint: ## Lint, typecheck and format-check the web app
	cd $(WEB_DIR) && pnpm lint && pnpm typecheck && pnpm format:check

.PHONY: check
check: lint test contract-check ## Everything CI runs
	cd $(WEB_DIR) && pnpm build
