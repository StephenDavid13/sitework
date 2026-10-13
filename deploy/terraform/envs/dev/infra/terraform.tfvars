# This AWS account is on the Free plan, which only launches Free Tier-eligible instance types.
# The cheapest eligible type big enough for the cluster is x86 (8 GiB), so the nodes are x86
# here; the images are multi-arch. On a Paid-plan account, delete these two lines to use the
# default Graviton t4g.medium nodes.
node_instance_types = ["m7i-flex.large"]
node_ami_type       = "AL2023_x86_64_STANDARD"
