# Observability and privacy

Collect service health, not browsing behavior.

## Metrics

- HTTP request count, status class and latency by coarse route template
- 429 and 503 counts
- in-flight request count and DB pool saturation
- /readyz state
- publication success/failure and artifact age
- submission queue volume by submission type
- backup age, restore-drill timestamp, disk usage and process restarts

Never label metrics with entity IDs, visited domains, extension cause selections, account IDs, evidence searches or full URLs.

## Alerts

Page/notify on sustained readiness failure, elevated 5xx, DB exhaustion, publication expiry/failure, low disk, stale backups or unexpected origin traffic. Rate-limit alerts for 429 spikes separately so abuse does not create an alert storm.

Use the hosting/CDN/PostgreSQL monitoring stack available on the production server rather than adding a second telemetry vendor by default.

## Retention

Routine application metrics must not contain browsing preferences or encountered accounts. Edge/access-log retention is configured at the hosting provider and must be documented before launch.

Reviewed `spam` and `duplicate` community submissions have source URLs and free-text/contact fields removed after 90 days by `ops/retention.sql`; the minimal moderation receipt/state remains for abuse/audit accounting. Accepted evidence and ordinary rejected corrections are not automatically destroyed by that abuse cleanup because they may be needed to explain editorial history.
