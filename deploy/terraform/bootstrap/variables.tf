variable "region" {
  description = "AWS region for the state bucket. The other stacks pass the same value to their S3 backend."
  type        = string
  default     = "ap-southeast-2"
}

variable "project" {
  description = "Project name, used as the bucket name prefix and the Project tag."
  type        = string
  default     = "sitework"
}

variable "noncurrent_version_retention_days" {
  description = "Days to keep superseded state versions before they expire."
  type        = number
  default     = 90
}
