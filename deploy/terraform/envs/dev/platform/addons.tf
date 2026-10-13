################################################################################
# AWS Load Balancer Controller
################################################################################

module "aws_lb_controller_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.9"

  name               = "${local.name}-aws-lbc"
  policy_name_prefix = "${local.name}-"

  attach_aws_lb_controller_policy = true

  associations = {
    this = {
      cluster_name    = local.infra.cluster_name
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
    }
  }
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.chart_versions.aws_load_balancer_controller
  namespace  = "kube-system"

  wait            = true
  atomic          = true
  cleanup_on_fail = true
  timeout         = 600
  max_history     = 5

  values = [yamlencode({
    clusterName = local.infra.cluster_name
    region      = local.infra.region
    vpcId       = local.infra.vpc_id
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
    }
    # The app is exposed through an Ingress only. The Service mutating webhook fails
    # closed (failurePolicy: Fail) on every Service create, so leave it off.
    enableServiceMutatorWebhook = false
  })]

  # The Pod Identity association must exist before the pods start, or they get no credentials.
  depends_on = [module.aws_lb_controller_pod_identity]
}

################################################################################
# External Secrets Operator
################################################################################

# RDS-managed secrets are encrypted with the AWS-managed Secrets Manager key.
data "aws_kms_alias" "secretsmanager" {
  name = "alias/aws/secretsmanager"
}

module "external_secrets_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.9"

  name               = "${local.name}-eso"
  policy_name_prefix = "${local.name}-"

  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = [local.infra.rds_master_secret_arn]
  external_secrets_kms_key_arns         = [data.aws_kms_alias.secretsmanager.target_key_arn]
  external_secrets_create_permission    = false

  associations = {
    this = {
      cluster_name    = local.infra.cluster_name
      namespace       = "external-secrets"
      service_account = "external-secrets"
    }
  }
}

resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.chart_versions.external_secrets
  namespace        = "external-secrets"
  create_namespace = true

  wait            = true
  atomic          = true
  cleanup_on_fail = true
  timeout         = 600
  max_history     = 5

  values = [yamlencode({
    installCRDs = true
    serviceAccount = {
      create = true
      name   = "external-secrets"
    }
  })]

  depends_on = [
    module.external_secrets_pod_identity,
    helm_release.aws_load_balancer_controller,
  ]
}

################################################################################
# ExternalDNS: the subdomain zone only
################################################################################

module "external_dns_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.9"

  name               = "${local.name}-external-dns"
  policy_name_prefix = "${local.name}-"

  attach_external_dns_policy    = true
  external_dns_hosted_zone_arns = [local.foundation.zone_arn]

  associations = {
    this = {
      cluster_name    = local.infra.cluster_name
      namespace       = "external-dns"
      service_account = "external-dns"
    }
  }
}

resource "helm_release" "external_dns" {
  name             = "external-dns"
  repository       = "https://kubernetes-sigs.github.io/external-dns/"
  chart            = "external-dns"
  version          = var.chart_versions.external_dns
  namespace        = "external-dns"
  create_namespace = true

  wait            = true
  atomic          = true
  cleanup_on_fail = true
  timeout         = 300
  max_history     = 5

  values = [yamlencode({
    provider = {
      name = "aws"
    }
    sources       = ["ingress"]
    domainFilters = [local.foundation.zone_name]
    policy        = "sync"
    registry      = "txt"
    txtOwnerId    = local.name
    # Belt and braces with the IAM policy: only ever look at the subdomain zone.
    extraArgs = ["--zone-id-filter=${local.foundation.zone_id}"]
    # Node IMDS is not reachable from pods (hop limit 1), so give the SDK its region.
    env = [{
      name  = "AWS_DEFAULT_REGION"
      value = local.infra.region
    }]
    serviceAccount = {
      create = true
      name   = "external-dns"
    }
  })]

  # ExternalDNS publishes the ALB host names the controller writes into Ingress status.
  depends_on = [
    module.external_dns_pod_identity,
    helm_release.aws_load_balancer_controller,
  ]
}

################################################################################
# metrics-server (HPA)
################################################################################

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.chart_versions.metrics_server
  namespace  = "kube-system"

  wait            = true
  atomic          = true
  cleanup_on_fail = true
  timeout         = 300
  max_history     = 5

  # Install after the controller so its pod webhook is already serving.
  depends_on = [helm_release.aws_load_balancer_controller]
}
