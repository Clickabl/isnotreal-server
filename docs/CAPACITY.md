# Capacity and scale model

The architecture is designed so extension scale is dominated by cache/CDN traffic, not per-user database queries.

## Request path

- Signed publication artifacts are immutable and cacheable for one year.
- Cause/API metadata is cacheable at the edge for short periods.
- Ordinary domain/feed matching happens locally in the browser.
- Encountered account IDs are not queried against PostgreSQL.
- PostgreSQL serves editorial/search/evidence work and cache misses, not every page view.

At 10 million installed clients, a synchronized update window must be spread with client jitter/backoff and CDN caching. Do not schedule every client at a fixed clock time.

## Budgets

- extension DNR compiler: CI enforces a 10,000-domain synthetic compilation within the browser regex-rule budget and a 2.5s test ceiling;
- application request body: 128 KiB production default;
- artifact response safety ceiling: 64 MiB;
- Node concurrent in-flight backstop: 200 per process;
- public DB pool default: 20 per API process; editor pool: 2;
- public/write edge rate limits are separated in the Nginx template.

These are guardrails, not a claim that one Node process serves 10 million simultaneous clients. Horizontal API replicas, a managed PostgreSQL service, CDN/origin shielding and production load tests are required before a high-volume launch.

## Production validation

1. Put the exact production CDN/WAF and database topology in a staging environment.
2. Publish representative full/delta artifacts at expected upper-bound size.
3. Run `npm run load:smoke` for local process health, then a distributed load tool against staging with explicit authorization.
4. Measure p50/p95/p99, DB pool wait, CPU, memory, egress/cache-hit ratio, 429/503 and artifact origin hits.
5. Increase concurrency gradually. Do not bypass provider abuse controls or run remote load tests without authorization.
6. Record the measured capacity and autoscaling thresholds in the deployment runbook before launch.
