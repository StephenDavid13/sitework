################################################################################
# CloudWatch Observability (Container Insights metrics + Fluent Bit container logs)
#
# Pods log structured JSON to stdout; this add-on ships it to CloudWatch Logs so logs
# survive pod/node churn and can be queried with Logs Insights.
################################################################################

locals {
  container_insights_log_groups = var.enable_container_insights ? toset([
    "application", "dataplane", "host", "performance",
  ]) : toset([])
}

# Created up front with a retention period: the add-on would otherwise create them
# with "never expire".
resource "aws_cloudwatch_log_group" "container_insights" {
  for_each = local.container_insights_log_groups

  name              = "/aws/containerinsights/${local.infra.cluster_name}/${each.key}"
  retention_in_days = var.log_retention_days
}

module "cloudwatch_observability_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.9"

  create = var.enable_container_insights

  name               = "${local.name}-cloudwatch-observability"
  policy_name_prefix = "${local.name}-"

  attach_aws_cloudwatch_observability_policy = true
  # The association is made by the EKS add-on itself (below).
}

resource "aws_eks_addon" "cloudwatch_observability" {
  count = var.enable_container_insights ? 1 : 0

  cluster_name                = local.infra.cluster_name
  addon_name                  = "amazon-cloudwatch-observability"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  pod_identity_association {
    role_arn        = module.cloudwatch_observability_pod_identity.iam_role_arn
    service_account = "cloudwatch-agent"
  }

  depends_on = [aws_cloudwatch_log_group.container_insights]
}
