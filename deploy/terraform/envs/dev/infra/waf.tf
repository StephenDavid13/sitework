################################################################################
# AWS WAF on the application load balancer
#
# The site is public without logins, so filter at the edge before traffic reaches pods:
# a per-IP rate limit (a backstop above the API's own 600 requests/min) plus AWS managed
# rules for common exploits, known-bad inputs and IPs with a poor reputation.
# The Load Balancer Controller attaches it via the Ingress (ingress.wafAclArn, from SSM).
# Cost: ~US$9/month (web ACL + 4 rules) plus US$0.60 per million requests.
################################################################################

locals {
  waf_managed_rule_groups = {
    AWSManagedRulesAmazonIpReputationList = 1
    AWSManagedRulesKnownBadInputsRuleSet  = 2
    AWSManagedRulesCommonRuleSet          = 3
  }
}

resource "aws_wafv2_web_acl" "app" {
  count = var.enable_waf ? 1 : 0

  name        = local.name
  description = "Edge protection for the ${local.name} ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit_per_5_minutes
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = local.waf_managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }
}
