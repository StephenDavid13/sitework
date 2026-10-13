output "region" {
  description = "AWS region."
  value       = local.region
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS API server endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA certificate."
  value       = module.eks.cluster_certificate_authority_data
}

output "node_security_group_id" {
  description = "Security group shared by the managed nodes (and therefore pods)."
  value       = module.eks.node_security_group_id
}

output "vpc_id" {
  description = "VPC ID (the Load Balancer Controller needs it)."
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block."
  value       = module.vpc.vpc_cidr_block
}

output "rds_address" {
  description = "RDS host name (no port)."
  value       = module.rds.db_instance_address
}

output "rds_master_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master credentials."
  value       = module.rds.db_instance_master_user_secret_arn
}

output "certificate_arn" {
  description = "Validated ACM certificate ARN for the subdomain."
  value       = aws_acm_certificate_validation.app.certificate_arn
}

output "helm_values_parameter" {
  description = "SSM parameter holding the environment's Helm values."
  value       = aws_ssm_parameter.helm_values.name
}

output "kubeconfig_command" {
  description = "Run this to point kubectl at the cluster."
  value       = "aws eks update-kubeconfig --region ${local.region} --name ${module.eks.cluster_name}"
}
