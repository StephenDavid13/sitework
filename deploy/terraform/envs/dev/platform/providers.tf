provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = local.project
      Environment = local.environment
      ManagedBy   = "terraform"
    }
  }
}

# Both Kubernetes-facing providers fetch a short-lived token with the AWS CLI on every
# run instead of storing credentials. The caller needs cluster access: the identity that
# applied the infra stack is a cluster admin via enable_cluster_creator_admin_permissions.
provider "kubernetes" {
  host                   = local.infra.cluster_endpoint
  cluster_ca_certificate = base64decode(local.infra.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", local.infra.cluster_name, "--region", local.infra.region]
  }
}

# helm provider v3: `kubernetes` and `exec` are attributes (objects), not blocks.
provider "helm" {
  kubernetes = {
    host                   = local.infra.cluster_endpoint
    cluster_ca_certificate = base64decode(local.infra.cluster_certificate_authority_data)

    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", local.infra.cluster_name, "--region", local.infra.region]
    }
  }
}
