terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  # Partial configuration: bucket and region are passed at init time, e.g.
  #   terraform init -backend-config="bucket=sitework-tfstate-<account>-ap-southeast-2" -backend-config="region=ap-southeast-2"
  # (`make tf-init-foundation` does this for you.)
  backend "s3" {
    key          = "dev/foundation.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
