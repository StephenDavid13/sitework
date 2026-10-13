terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.3"
    }
  }

  # Partial configuration: bucket and region are passed at init (`make tf-init-platform`).
  backend "s3" {
    key          = "dev/platform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
