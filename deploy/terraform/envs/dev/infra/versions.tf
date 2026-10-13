terraform {
  # >= 1.10 for S3 native locking; >= 1.11.1 is what terraform-aws-modules/rds v7 requires.
  required_version = ">= 1.11.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  # Partial configuration: bucket and region are passed at init (`make tf-init-infra`).
  backend "s3" {
    key          = "dev/infra.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
