locals {
  # Keyed on names known at plan time; the validation details are looked up per name.
  certificate_domains = toset([local.subdomain])
  certificate_validation_options = {
    for o in aws_acm_certificate.app.domain_validation_options : o.domain_name => o
  }
}

resource "aws_acm_certificate" "app" {
  domain_name       = local.subdomain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = local.subdomain == local.foundation.zone_name || endswith(local.subdomain, ".${local.foundation.zone_name}")
      error_message = "subdomain must be the foundation hosted zone (${local.foundation.zone_name}) or a name inside it, so it can be DNS-validated there."
    }
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.certificate_domains

  zone_id         = local.foundation.zone_id
  name            = local.certificate_validation_options[each.key].resource_record_name
  type            = local.certificate_validation_options[each.key].resource_record_type
  ttl             = 60
  records         = [local.certificate_validation_options[each.key].resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.certificate_validation : r.fqdn]
}
