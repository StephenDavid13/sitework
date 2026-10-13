# Persistent, cheap resources that survive tearing the environment down:
# the subdomain's hosted zone (so delegation is done once), ECR, and the CI identity.

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_region" "current" {}

locals {
  project     = "sitework"
  environment = "dev"
  name        = "${local.project}-${local.environment}"

  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region

  # Names the infra stack creates; the CI role is scoped to them up front.
  cluster_name           = local.name
  helm_values_param_name = "/${local.project}/${local.environment}/helm-values"
}

################################################################################
# DNS: hosted zone for the subdomain
################################################################################

resource "aws_route53_zone" "this" {
  name    = var.subdomain
  comment = "${local.project} ${local.environment}: delegated subdomain zone"
}

# Only when the parent domain is a Route 53 zone in this account. Otherwise add the
# name_servers output as an NS record at the parent's DNS provider (one-off).
resource "aws_route53_record" "delegation" {
  count = var.parent_zone_id == null ? 0 : 1

  zone_id = var.parent_zone_id
  name    = var.subdomain
  type    = "NS"
  ttl     = 3600
  records = aws_route53_zone.this.name_servers
}
