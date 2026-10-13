terraform {
  # >= 1.10 for S3 native state locking (use_lockfile) in the stacks that use this bucket.
  required_version = ">= 1.10"

  # Local state on purpose: this stack creates the bucket every other stack stores its state in.
  # The resulting terraform.tfstate is gitignored; see ../README.md for how to recover it.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }
}
