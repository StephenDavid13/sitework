# Expensive, disposable environment: VPC, EKS, RDS, certificate and the Helm values
# handed to CI. Destroy it between demo sessions; foundation keeps DNS/ECR/CI identity.

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = local.state_bucket
    key    = "dev/foundation.tfstate"
    region = var.region
  }
}

locals {
  project     = "sitework"
  environment = "dev"
  name        = "${local.project}-${local.environment}"

  region       = data.aws_region.current.region
  state_bucket = coalesce(var.state_bucket, "${local.project}-tfstate-${data.aws_caller_identity.current.account_id}-${var.region}")

  foundation = data.terraform_remote_state.foundation.outputs
  subdomain  = coalesce(var.subdomain, local.foundation.zone_name)

  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}
