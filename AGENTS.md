# Working boundaries

Read README.md, docs/architecture.md, docs/data-model.md and docs/PRODUCT_DELIVERY_PLAN.md before changing a module. Work directly on main as requested; do not overwrite unrelated changes.

The product plan is the current expanded scope: public website, installable extension, independent cause selection, source-backed data and separate software/data update pipelines. A backend CI pass is not evidence that this product is finished. Track implementation, runtime testing, deployment and public availability separately.

- Production origin: https://isnotreal.click.
- PostgreSQL is the canonical source of truth; migrations live in `db/migrations`. Do not rewrite already-applied migrations.
- Never upload encountered account/domain IDs during passive browsing.
- Public extension entries contain only stable identifiers, public entity IDs and reason codes, plus publication-level synchronization/cause metadata. Version cause-aware wire changes explicitly.
- Names, evidence, source URLs, moderation data and private contact references stay server-side.
- Stable platform IDs are opaque strings, not handles or JavaScript numbers.
- Assertions describe specific sourced facts. Reason codes summarize those facts. Membership decisions and users' cause selections are separate policy layers.
- Cause-aware decisions, validation, publications and client state must be scoped consistently. A highlight in one cause does not silently cancel a filter in another selected cause.
- Do not infer ideology or wrongdoing from nationality, identity or document mentions. Preserve source context and protected-person/privacy exclusions.
- Company/brand relationships do not automatically transfer factual assertions or list membership.
- Community submissions never publish directly; they require review. Trusted editor batches should not acquire redundant per-person approval stages.
- Do not automatically fetch user-submitted URLs from the ordinary API process. Source capture requires an isolated SSRF-hardened worker, including protection against DNS rebinding.
- Alternative redirects must never target an entity with an active filter inclusion decision. Personalized extension alternatives must also respect all enabled causes; a bare public redirect cannot know private local settings.
- Production publication signing must be isolated from the ordinary API process. Browser-store code releases are not interchangeable with data updates.
- Treat ops scripts as templates until execution-tested against disposable PostgreSQL. Do not deploy the public service with blanket table-write grants; consult O01/O02 in the product plan.
- Run `npm ci` and `npm run check` before committing when a full checkout/runtime is available. Browser, deployment and distribution claims require their own runtime evidence.
