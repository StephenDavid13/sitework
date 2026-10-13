# 0008: No logins yet; rate limiting instead

**Context.** Authentication was explicitly out of scope for the first release, but the site is
publicly reachable.

**Decision.** The site is public, with these safeguards:

- Per-client-IP rate limits: 600 requests/min, and 60 writes/min on writes.
- `X-Forwarded-For` is trusted only from the VPC CIDR, so clients can't spoof their IP.
- Request bodies are capped at 64 KB, and page sizes are capped.
- An optional ALB `inbound-cidrs` allowlist.
- A one-command demo-data reset.

The endpoints are grouped (`/api/jobs`, with writes in a sub-group), so adding auth later is a
`RequireAuthorization()` on the group plus an OIDC provider (e.g. Cognito).

**Consequences.** Anyone with the URL can change data. That's acceptable for a demo; it isn't
acceptable beyond one.
