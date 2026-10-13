variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "state_bucket" {
  description = "S3 bucket holding the foundation and infra stacks' state. Null derives the bootstrap naming convention: sitework-tfstate-<account>-<region>."
  type        = string
  default     = null
}

variable "chart_versions" {
  description = "Pinned Helm chart versions (latest stable as of 2026-10-13)."
  type = object({
    aws_load_balancer_controller = optional(string, "3.6.0")
    external_secrets             = optional(string, "2.12.0")
    external_dns                 = optional(string, "1.23.0")
    metrics_server               = optional(string, "3.14.0")
  })
  default = {}
}

variable "enable_container_insights" {
  description = "Ship container logs and metrics to CloudWatch (amazon-cloudwatch-observability add-on)."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Retention for the Container Insights log groups."
  type        = number
  default     = 14
}
