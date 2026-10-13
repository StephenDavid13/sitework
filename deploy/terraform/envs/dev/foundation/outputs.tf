output "zone_id" {
  description = "Route 53 hosted zone ID for the subdomain."
  value       = aws_route53_zone.this.zone_id
}

output "zone_arn" {
  description = "Route 53 hosted zone ARN (ExternalDNS is scoped to it)."
  value       = aws_route53_zone.this.arn
}

output "zone_name" {
  description = "The subdomain the zone serves."
  value       = aws_route53_zone.this.name
}

output "name_servers" {
  description = "Add these as an NS record for the subdomain at the parent domain's DNS provider (only needed when parent_zone_id is null)."
  value       = aws_route53_zone.this.name_servers
}

output "ecr_registry_url" {
  description = "ECR registry host for this account and region."
  value       = "${local.account_id}.dkr.ecr.${local.region}.amazonaws.com"
}

output "repository_urls" {
  description = "ECR repository URLs keyed by repository name."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "github_oidc_provider_arn" {
  description = "GitHub Actions OIDC provider in use (created here or supplied)."
  value       = local.github_oidc_provider_arn
}

output "ci_role_arn" {
  description = "Role for GitHub Actions to assume (aws-actions/configure-aws-credentials role-to-assume)."
  value       = var.enable_github_deploy ? aws_iam_role.github_deploy[0].arn : null
}
