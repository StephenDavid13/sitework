# Terraform / AWS targets. Included from the root Makefile, so paths are relative to the
# repo root. Apply order: tf-bootstrap -> foundation -> infra -> platform.
# Runbook: deploy/terraform/README.md

TF         ?= terraform
TF_ARGS    ?=
TF_ROOT    := deploy/terraform
TF_ENV     ?= dev
TF_ENV_DIR := $(TF_ROOT)/envs/$(TF_ENV)
TF_STACKS  := foundation infra platform
TF_DIRS    := $(TF_ROOT)/bootstrap $(addprefix $(TF_ENV_DIR)/,$(TF_STACKS))

AWS_REGION ?= ap-southeast-2
# Looked up on first use, at most once per make run, so targets that never touch AWS
# (help, tf-fmt, tf-validate) never call STS. Set AWS_ACCOUNT_ID to skip the lookup.
AWS_ACCOUNT_ID ?= $(eval AWS_ACCOUNT_ID := $$(shell aws sts get-caller-identity --query Account --output text))$(AWS_ACCOUNT_ID)
TF_STATE_BUCKET ?= sitework-tfstate-$(AWS_ACCOUNT_ID)-$(AWS_REGION)
TF_BACKEND_CONFIG = -backend-config="bucket=$(TF_STATE_BUCKET)" -backend-config="region=$(AWS_REGION)"
TF_VAR_ENV = TF_VAR_region=$(AWS_REGION) TF_VAR_state_bucket=$(TF_STATE_BUCKET)
EKS_CLUSTER ?= sitework-$(TF_ENV)

TF_INIT_TARGETS    := $(addprefix tf-init-,$(TF_STACKS))
TF_PLAN_TARGETS    := $(addprefix tf-plan-,$(TF_STACKS))
TF_APPLY_TARGETS   := $(addprefix tf-apply-,$(TF_STACKS))
TF_DESTROY_TARGETS := $(addprefix tf-destroy-,$(TF_STACKS))

.PHONY: tf-bootstrap tf-fmt tf-validate tf-scan kubeconfig _tf-require-aws
.PHONY: $(TF_INIT_TARGETS) $(TF_PLAN_TARGETS) $(TF_APPLY_TARGETS) $(TF_DESTROY_TARGETS)

_tf-require-aws:
	@test -n "$(AWS_ACCOUNT_ID)" || { echo "Cannot resolve the AWS account; check credentials with 'aws sts get-caller-identity'." >&2; exit 1; }

tf-bootstrap: _tf-require-aws ## Create the Terraform state bucket (local state, run once)
	$(TF) -chdir=$(TF_ROOT)/bootstrap init -input=false
	TF_VAR_region=$(AWS_REGION) $(TF) -chdir=$(TF_ROOT)/bootstrap apply $(TF_ARGS)

# One line per target so `make help` lists them; the recipes are shared below.
tf-init-foundation: ## Init the foundation stack (DNS zone, ECR, CI role)
tf-init-infra: ## Init the infra stack (VPC, EKS, RDS, certificate)
tf-init-platform: ## Init the platform stack (cluster add-ons, app namespace)
tf-plan-foundation: ## Plan the foundation stack
tf-plan-infra: ## Plan the infra stack
tf-plan-platform: ## Plan the platform stack
tf-apply-foundation: ## Apply the foundation stack
tf-apply-infra: ## Apply the infra stack (~20 min)
tf-apply-platform: ## Apply the platform stack
tf-destroy-foundation: ## Destroy the foundation stack (rarely needed; drops DNS delegation)
tf-destroy-infra: ## Destroy the infra stack (destroy platform first)
tf-destroy-platform: ## Destroy the platform stack (uninstall the app release first)

$(TF_INIT_TARGETS): tf-init-%: _tf-require-aws
	$(TF) -chdir=$(TF_ENV_DIR)/$* init -input=false -reconfigure $(TF_BACKEND_CONFIG)

$(TF_PLAN_TARGETS): tf-plan-%: tf-init-%
	$(TF_VAR_ENV) $(TF) -chdir=$(TF_ENV_DIR)/$* plan -input=false $(TF_ARGS)

$(TF_APPLY_TARGETS): tf-apply-%: tf-init-%
	$(TF_VAR_ENV) $(TF) -chdir=$(TF_ENV_DIR)/$* apply $(TF_ARGS)

$(TF_DESTROY_TARGETS): tf-destroy-%: tf-init-%
	$(TF_VAR_ENV) $(TF) -chdir=$(TF_ENV_DIR)/$* destroy $(TF_ARGS)

tf-fmt: ## Format all Terraform files
	$(TF) fmt -recursive $(TF_ROOT)

tf-validate: ## Check formatting and validate every stack (no AWS access needed)
	$(TF) fmt -check -recursive $(TF_ROOT)
	@set -e; for dir in $(TF_DIRS); do \
		echo "==> $$dir"; \
		$(TF) -chdir=$$dir init -backend=false -input=false >/dev/null; \
		$(TF) -chdir=$$dir validate; \
	done

tf-scan: ## Scan the Terraform for HIGH/CRITICAL misconfigurations (trivy)
	trivy config --severity HIGH,CRITICAL --exit-code 1 --skip-dirs '**/.terraform' $(TF_ROOT)

kubeconfig: ## Point kubectl at the EKS cluster
	aws eks update-kubeconfig --region $(AWS_REGION) --name $(EKS_CLUSTER)
