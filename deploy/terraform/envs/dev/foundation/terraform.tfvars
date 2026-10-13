# Served at https://sitework.stephendavid.dev. The subdomain gets its own Route 53 hosted zone.
subdomain = "sitework.stephendavid.dev"

# stephendavid.dev's DNS is hosted at Porkbun (not Route 53), so the delegation is manual:
# after `make tf-apply-foundation`, add the four `name_servers` outputs in Porkbun as NS records
# for the host `sitework` (see deploy/terraform/README.md, step 4).
parent_zone_id = null

# This account's organization policy blocks GitHub OIDC providers, so CI doesn't deploy here;
# releases run from a workstation with `make aws-release`. CI still runs every check.
enable_github_deploy = false

# Repository whose main branch may assume the CI deploy role (when enable_github_deploy = true).
github_repository = "StephenDavid13/sitework"

# Only used when enable_github_deploy = true: null creates the GitHub OIDC provider; if the
# account already has one, paste its ARN here instead.
github_oidc_provider_arn = null
