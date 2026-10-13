variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "subdomain" {
  description = "Fully qualified subdomain the app is served on; gets its own public hosted zone (e.g. sitework.example.com)."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.subdomain))
    error_message = "subdomain must be a lower-case fully qualified domain name without a trailing dot, e.g. sitework.example.com."
  }
}

variable "parent_zone_id" {
  description = "Route 53 hosted zone ID of the parent domain, when it lives in this AWS account. If set, the NS delegation record is created for you; if null, add the name_servers output at your DNS provider."
  type        = string
  default     = null
}

variable "enable_github_deploy" {
  description = "Create the GitHub Actions OIDC provider and CI deploy role. Set false when an organization policy blocks OIDC providers; deploy from a workstation with `make aws-release` instead."
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose main branch may assume the CI deploy role."
  type        = string
  default     = "StephenDavid13/sitework"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/repo."
  }
}

variable "github_oidc_provider_arn" {
  description = "ARN of an existing GitHub Actions OIDC provider (an account can only have one). Leave null to create it. Find it with `aws iam list-open-id-connect-providers`."
  type        = string
  default     = null
}
