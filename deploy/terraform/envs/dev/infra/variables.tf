variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "state_bucket" {
  description = "S3 bucket holding the foundation stack's state. Null derives the bootstrap naming convention: sitework-tfstate-<account>-<region>."
  type        = string
  default     = null
}

variable "subdomain" {
  description = "Host name the app is served on (certificate + Helm ingress host). Null uses the foundation hosted zone's name."
  type        = string
  default     = null
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.20.0.0/16"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes minor version. Default is the newest version in EKS standard support as of 2026-10-13 (1.37, standard support until 2027-12-01)."
  type        = string
  default     = "1.37"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Open by default because GitHub-hosted runners have no fixed IPs; narrow it to your own IP when you can."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_instance_types" {
  description = "Instance types for the managed node group (must be arm64 / Graviton to match the AMI type)."
  type        = list(string)
  default     = ["t4g.medium"]
}

variable "enable_waf" {
  description = "Attach an AWS WAF web ACL (per-IP rate limit + AWS managed rules) to the app's load balancer (~US$9/month)."
  type        = bool
  default     = true
}

variable "waf_rate_limit_per_5_minutes" {
  description = "Requests per client IP per 5 minutes before WAF blocks it. A backstop above the API's own per-IP limits."
  type        = number
  default     = 3000
}
