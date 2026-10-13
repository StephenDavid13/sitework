# Environment-specific values for the `sitework` Helm chart. CI reads this parameter
# and passes it as an extra `-f` values file, so nothing account-specific is committed.
resource "aws_ssm_parameter" "helm_values" {
  name        = "/${local.project}/${local.environment}/helm-values"
  description = "Extra Helm values for the ${local.name} release (written by Terraform infra stack)"
  type        = "String" # Contains ARNs and host names only, no secret material.
  tier        = "Standard"

  value = yamlencode({
    image = {
      registry = local.foundation.ecr_registry_url
    }
    ingress = merge(
      {
        host           = local.subdomain
        certificateArn = aws_acm_certificate_validation.app.certificate_arn
      },
      var.enable_waf ? { wafAclArn = aws_wafv2_web_acl.app[0].arn } : {},
    )
    database = {
      host = module.rds.db_instance_address
      externalSecret = {
        secretArn = module.rds.db_instance_master_user_secret_arn
        region    = local.region
      }
    }
    api = {
      trustedProxyNetworks = [module.vpc.vpc_cidr_block]
    }
  })
}
