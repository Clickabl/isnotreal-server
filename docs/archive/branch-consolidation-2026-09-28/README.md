# isnotreal-server branch consolidation, 2026-09-28

Owner rule: there are no branches, ever. Everything below was reconciled and the branch or PR
deleted or closed. Work is on `main`, or preserved here as a re-appliable patch (`git am`).

## What production was running
`main` was 23 commits behind what is live: the deployed release (`c41bbeb`) existed only on
`deploy/cpanel`. `main` was fast-forwarded to `c41bbeb`, so `main` now equals production and the
deploy script's default ref (`main`) deploys what is live.

## Merged onto main
- `deploy/cpanel` (PR #10): fast-forward, as above. `deploy/namecheap` (PR #9) was fully contained.
- Dependency updates, applied on `main` after `format:check`, `lint`, `typecheck` and `test` all passed:
  prettier 3.9.8, eslint 10.11.0, actions/checkout v7, actions/setup-node v7.

## Not merged, and why
| Item | Reason |
| --- | --- |
| `typescript` 7.0.2 (Dependabot PR #3) | Fails `lint`, `typecheck` and `test` on current code. Needs a migration pass. |
| `@types/node` 26.6.2 (PR #8) | Excluded by policy: the cPanel host tops out at Node 24; types must match. |
| `actions/upload-artifact` v7 (PR #5) | No workflow uses it any more. |
| `quality/ui-feedback-20260922` (8 commits, tip `40d6dfe`) | **Owner decision needed.** A complete unified feedback intake, editor inbox, `/help` route and request guard. `main` (production) has a newer, owner-written "Spill the tea" `/report` page. The two `/report` implementations collide in `apps/web/src/index.ts`, `runtime.ts` and the routing tests, so choosing/combining them is a product call. Kept whole: `patches/quality_ui-feedback-20260922.patch`. |
| 23 `diagnostics/*`, `format/*`, `integration/*` branches | One-shot CI experiments (throwaway workflow files plus formatting edits that `main` already superseded with its own prettier pass and its removal of those workflows). Bundled in `patches/ci-experiment-branches.patch`. |

`.github/dependabot.yml` was removed: Dependabot exists to open branches and PRs. Update
dependencies deliberately, on `main`, with the checks above.
