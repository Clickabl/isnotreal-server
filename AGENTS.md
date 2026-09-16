# Working boundaries

Read README.md, docs/architecture.md and docs/data-model.md before changing a module. Work directly on main as requested; do not overwrite unrelated changes.

- Production origin: https://isnotreal.click.
- PostgreSQL is the canonical source of truth; migrations live in `db/migrations`.
- Never upload encountered account/domain IDs during passive browsing.
- Public extension publications contain only stable identifiers, public entity IDs, reason codes and synchronization metadata.
- Names, evidence, source URLs, moderation data and private contact references stay server-side.
- Stable platform IDs are opaque strings, not handles or JavaScript numbers.
- Assertions describe specific sourced facts. Reason codes summarize those facts. Membership decisions are separate editorial policy.
- Company/brand relationships do not automatically transfer factual assertions or list membership.
- Community submissions never publish directly; they require review.
- Do not automatically fetch user-submitted URLs from the ordinary API process. Source capture requires an isolated SSRF-hardened worker.
- Alternative redirects must never target an entity with an active filter inclusion decision.
- Production publication signing must be isolated from the ordinary API process.
- Run `npm ci` and `npm run check` before committing when a full checkout/runtime is available.
