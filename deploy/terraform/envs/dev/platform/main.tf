# Cluster add-ons and the app namespace. Each add-on that calls AWS gets its own IAM
# role through EKS Pod Identity, scoped to the one resource it needs.

data "aws_caller_identity" "current" {}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = local.state_bucket
    key    = "dev/foundation.tfstate"
    region = var.region
  }
}

data "terraform_remote_state" "infra" {
  backend = "s3"

  config = {
    bucket = local.state_bucket
    key    = "dev/infra.tfstate"
    region = var.region
  }
}

locals {
  project     = "sitework"
  environment = "dev"
  name        = "${local.project}-${local.environment}"

  state_bucket = coalesce(var.state_bucket, "${local.project}-tfstate-${data.aws_caller_identity.current.account_id}-${var.region}")

  foundation = data.terraform_remote_state.foundation.outputs
  infra      = data.terraform_remote_state.infra.outputs

  app_namespace   = local.project
  deployers_group = "${local.project}-deployers" # Must match the CI access entry group in infra.
}
