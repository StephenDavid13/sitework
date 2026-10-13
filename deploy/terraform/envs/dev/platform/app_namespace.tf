# The app namespace and the only Kubernetes permissions the CI deploy role gets.
# The infra stack maps the role to the `sitework-deployers` group with no access
# policies, so this Role is everything CI can do in the cluster.

resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = local.app_namespace
    labels = {
      "app.kubernetes.io/part-of" = local.project
      # Pods only turn Ready once the ALB target group reports them healthy, so
      # `helm --wait` and rolling updates do not drop traffic.
      "elbv2.k8s.aws/pod-readiness-gate-inject" = "enabled"
      # Reject privileged or root pods outright (the chart already meets "restricted").
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = "latest"
    }
  }
}

locals {
  deployer_verbs = ["get", "list", "watch", "create", "update", "patch", "delete"]
  read_verbs     = ["get", "list", "watch"]
}

resource "kubernetes_role_v1" "deployer" {
  metadata {
    name      = "${local.project}-deployer"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  # Helm 4 stores release state as Secrets in the release namespace.
  rule {
    api_groups = [""]
    resources  = ["services", "configmaps", "secrets", "serviceaccounts"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = [""]
    resources  = ["pods"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = [""]
    resources  = ["pods/log"]
    verbs      = ["get"]
  }

  rule {
    api_groups = ["", "events.k8s.io"]
    resources  = ["events"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "statefulsets"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = ["apps"]
    resources  = ["replicasets"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = ["batch"]
    resources  = ["jobs"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = ["policy"]
    resources  = ["poddisruptionbudgets"]
    verbs      = local.deployer_verbs
  }

  rule {
    api_groups = ["external-secrets.io"]
    resources  = ["secretstores", "externalsecrets"]
    verbs      = local.deployer_verbs
  }
}

resource "kubernetes_role_binding_v1" "deployer" {
  metadata {
    name      = "${local.project}-deployer"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.deployer.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = local.deployers_group
  }
}
