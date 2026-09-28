# Working boundaries

## NO BRANCHES. EVER. (owner rule, reaffirmed 2026-09-28)

**There must never be a branch of any kind in this repository. Only `main`.** Commit directly
to `main` and push. Do not create, push, keep or leave: feature, fix, hotfix, experiment,
diagnostic, format, integration, "preserve"/"recovery", release, deploy or agent branches;
draft PRs; Dependabot/Renovate branches; forks used as branches. Do not leave stashes or
worktrees behind when your session ends.

**Why:** every branch is a place where work gets lost, redone, or quietly diverges from what is
live. In September 2026 this cost weeks: production ran a commit that existed on no `main`,
sign-in fixes sat unmerged while builds shipped without them, and ~100 branches (many just
CI experiments) had to be reconciled by hand.

**How to work without branches**
1. `git pull --rebase` before you start and again before you push.
2. Make small, complete commits on `main`. Run this repo's checks locally *before* pushing
   (GitHub Actions minutes are limited; validate locally). Never bypass a required test,
   content-approval, trust, rights or production gate: fix it, on `main`, before pushing more.
   Push right away so other agents see it.
3. If `main` moved, `git pull --rebase` and push again. Never force-push `main`.
4. Verify after the push (deploy/health/tests as this repo documents). Checks passing locally
   plus a live check replaces review branches.
5. Half-finished work is still committed to `main` if it is safe (behind a flag, unrouted, or
   documented), otherwise keep it uncommitted in your working tree and finish it. Never park it
   on a branch or in a stash.

6. **Before any build or release**, confirm the repo is clean of everything but `main`:
   `git fetch --prune && git branch -a && git stash list && git worktree list && gh pr list`.
   Anything else is reconciled first (below). There is no "documented exception" process.

**If you find a branch, PR, stash or worktree here** (or in any Clickabl repo): reconcile it into
`main` now, or, if it is superseded or needs an owner decision, save it as a patch under
`docs/archive/` with the reason, then delete the branch. Never leave it "for later".
Dependency updates are made on `main` by hand; version-update bots are off.

If any other document in this repo says to branch, open a PR, or keep an "exception", this rule
wins. Fix that document on `main`.

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
