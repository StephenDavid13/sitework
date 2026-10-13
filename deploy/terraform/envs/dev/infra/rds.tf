resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  description = "PostgreSQL access from EKS nodes only"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = "${local.name}-rds"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Pods use the node security group (VPC CNI without per-pod security groups),
# so this admits the API and the migrations Job and nothing else.
resource "aws_vpc_security_group_ingress_rule" "rds_from_nodes" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from EKS nodes"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = module.eks.node_security_group_id
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 7.2"

  identifier = local.name

  engine                   = "postgres"
  engine_version           = "17"
  family                   = "postgres17"
  major_engine_version     = "17"
  engine_lifecycle_support = "open-source-rds-extended-support-disabled"
  instance_class           = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "sitework"
  username = "sitework"
  port     = 5432

  # RDS generates the password and keeps it in Secrets Manager; ESO syncs it into the cluster.
  manage_master_user_password = true

  # Dev trade-offs: single AZ, 1-day backups, no final snapshot, no deletion protection.
  multi_az                = false
  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  performance_insights_enabled = false

  # PostgreSQL has no option-group options worth managing.
  create_db_option_group = false
}
