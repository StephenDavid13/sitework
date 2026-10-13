# 0005: RDS-managed password → External Secrets → mounted file

**Context.** No secret should be in Git, images or Terraform outputs. RDS can generate and
rotate its master password in Secrets Manager, but a rotation would break any app that read the
password once at startup.

**Decision.**

- **Generation:** `manage_master_user_password = true` (RDS owns the secret).
- **Sync into the cluster:** the External Secrets Operator, authenticated with EKS Pod Identity
  and allowed to read only that secret, copies it into a Kubernetes Secret every 5 minutes.
- **Delivery:** the chart mounts the password as a file. Kubernetes updates mounted Secrets in
  place.
- **Use:** the API builds its connection string piecewise (`NpgsqlConnectionStringBuilder`), and
  Npgsql's periodic password provider re-reads the file every 5 minutes for new connections.
- **Local dev:** the same chart uses a plain `existingSecret`.

**Consequences.** Rotation needs no restart or deploy. There's a window of up to ~10 minutes
after a rotation in which brand-new connections may fail; pooled connections carry on.
