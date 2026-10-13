module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = local.name
  cidr = var.vpc_cidr
  azs  = local.azs

  # Private subnets are /19s because the VPC CNI gives every pod a VPC IP.
  # 10.20.0.0/19, 10.20.32.0/19 | public 10.20.64.0/24, .65 | database 10.20.80.0/24, .81
  private_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 3, i)]
  public_subnets   = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, 64 + i)]
  database_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, 80 + i)]

  # Dev trade-off: one NAT gateway (~US$35-45/month) instead of one per AZ.
  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  create_database_subnet_group           = true
  create_database_subnet_route_table     = true
  create_database_internet_gateway_route = false

  # Subnet discovery for the AWS Load Balancer Controller.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
