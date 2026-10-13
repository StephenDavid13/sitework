output "state_bucket_name" {
  description = "S3 bucket holding remote state for the foundation, infra and platform stacks."
  value       = aws_s3_bucket.state.id
}

output "state_bucket_arn" {
  description = "ARN of the state bucket."
  value       = aws_s3_bucket.state.arn
}

output "region" {
  description = "Region of the state bucket (pass to the S3 backend as -backend-config=region=...)."
  value       = data.aws_region.current.region
}
