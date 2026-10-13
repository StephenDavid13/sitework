################################################################################
# GitHub Actions OIDC provider (create, or reuse the account's existing one)
################################################################################

locals {
  github_oidc_host = "token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_deploy && var.github_oidc_provider_arn == null ? 1 : 0

  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list omitted: AWS validates GitHub's certificate against its own trusted CAs.
}

# Validates at plan time that the supplied provider actually exists.
data "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_deploy && var.github_oidc_provider_arn != null ? 1 : 0

  arn = var.github_oidc_provider_arn
}

locals {
  github_oidc_provider_arn = (
    !var.enable_github_deploy ? null
    : var.github_oidc_provider_arn == null ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

################################################################################
# CI deploy role: main branch of one repository only
################################################################################

data "aws_iam_policy_document" "github_deploy_trust" {
  count = var.enable_github_deploy ? 1 : 0

  statement {
    sid     = "GitHubActionsMainBranch"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Exact match: no wildcards, so PRs, other branches, tags and other repos are refused.
    # Note: a job that sets `environment:` gets a different `sub` and will not match.
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count = var.enable_github_deploy ? 1 : 0

  name                 = "${local.name}-github-deploy"
  description          = "Assumed by GitHub Actions (${var.github_repository}@main) to push images and deploy the Helm release"
  assume_role_policy   = data.aws_iam_policy_document.github_deploy_trust[0].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # The action does not support resource-level permissions.
  }

  statement {
    sid    = "EcrPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repo in aws_ecr_repository.this : repo.arn]
  }

  # Needed by `aws eks update-kubeconfig`; Kubernetes permissions come from the
  # cluster access entry (infra) + namespace RBAC (platform).
  statement {
    sid       = "EksDescribeCluster"
    effect    = "Allow"
    actions   = ["eks:DescribeCluster"]
    resources = ["arn:${local.partition}:eks:${local.region}:${local.account_id}:cluster/${local.cluster_name}"]
  }

  # Environment-specific Helm values written by the infra stack.
  statement {
    sid       = "ReadHelmValues"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter${local.helm_values_param_name}"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count = var.enable_github_deploy ? 1 : 0

  name   = "deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy.json
}
