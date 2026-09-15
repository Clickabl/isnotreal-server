# Working boundaries

Read README.md and docs/architecture.md before changing a module. Work directly on main as requested; do not overwrite unrelated changes. This initial pass is scaffolding only.

- Production origin: https://isnotreal.click.
- Never upload encountered account IDs during passive browsing.
- Public blocklist payloads carry platform account IDs and synchronization metadata only.
- Why requests require an explicit user action; no hover prefetch, previews, or passive lookups.
- Stable IDs are opaque strings, not handles or JavaScript numbers. Missing stable ID means unresolved, never a guessed identity.
- Evidence records describe documented actions, statements, or affiliations with specific sources. Broad unsupported conclusions are not facts.
- Keep site adapters inside the extension repo; keep evidence/moderation types on the server.
- Run npm ci and npm run check before committing. Do not claim scaffold tests prove browser or API behavior.
- Do not add datasets, working adapters, filtering, database implementation, deployment, or telemetry without a new implementation task.
