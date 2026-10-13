# Accepted trivy findings (dev trade-offs, see ../../../README.md), scoped to this module:
# - AVD-AWS-0040 / AVD-AWS-0041: public API endpoint, open to 0.0.0.0/0 by default because
#   GitHub-hosted runners have no fixed IPs. Access still needs IAM + an access entry;
#   narrow it with var.cluster_endpoint_public_access_cidrs.
# - AVD-AWS-0104: the module's node security group allows all egress. Nodes must reach
#   ECR, public image registries and AWS APIs through the NAT gateway.
#trivy:ignore:AVD-AWS-0040
#trivy:ignore:AVD-AWS-0041
#trivy:ignore:AVD-AWS-0104
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name               = local.name
  kubernetes_version = var.kubernetes_version

  # Never slip into paid extended support; EKS upgrades the control plane instead.
  upgrade_policy = {
    support_type = "STANDARD"
  }

  # Dev trade-off: public endpoint so a laptop and GitHub-hosted runners can reach the API.
  # Authentication is still IAM + access entries; nodes use the private endpoint.
  endpoint_public_access       = true
  endpoint_private_access      = true
  endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Workloads use EKS Pod Identity (platform stack), so no IRSA OIDC provider.
  enable_irsa = false

  # Secrets envelope encryption with a module-managed KMS key (default), short windows for dev.
  kms_key_deletion_window_in_days        = 7
  cloudwatch_log_group_retention_in_days = 7

  addons = {
    coredns    = {}
    kube-proxy = {}
    vpc-cni = {
      before_compute = true
    }
    eks-pod-identity-agent = {
      before_compute = true
    }
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_ARM_64_STANDARD"
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"

      min_size     = 2
      desired_size = 2
      max_size     = 4

      subnet_ids = module.vpc.private_subnets

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 20
            volume_type           = "gp3"
            encrypted             = true
            delete_on_termination = true
          }
        }
      }
    }
  }

  # CI deploy role from foundation: maps into a Kubernetes group with no cluster-wide
  # rights. The platform stack binds that group to a Role in the app namespace only.
  access_entries = {
    github_deploy = {
      principal_arn     = local.foundation.ci_role_arn
      kubernetes_groups = ["sitework-deployers"]
    }
  }
}
