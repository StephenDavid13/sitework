output "app_namespace" {
  description = "Namespace the CI role may deploy the sitework release into."
  value       = kubernetes_namespace_v1.app.metadata[0].name
}

output "deployers_group" {
  description = "Kubernetes group bound to the deployer Role (matches the CI access entry)."
  value       = local.deployers_group
}

output "pod_identity_role_arns" {
  description = "IAM roles assumed by the add-ons through EKS Pod Identity."
  value = {
    aws_load_balancer_controller = module.aws_lb_controller_pod_identity.iam_role_arn
    external_secrets             = module.external_secrets_pod_identity.iam_role_arn
    external_dns                 = module.external_dns_pod_identity.iam_role_arn
  }
}

output "chart_versions" {
  description = "Helm chart versions installed."
  value       = var.chart_versions
}
