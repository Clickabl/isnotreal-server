# Verification

Run `npm run check` for formatting, lint, build/typecheck and Node tests. Set `RUN_DB_INTEGRATION=1` and a disposable `DATABASE_URL` to exercise all migrations, evidence/publication isolation, feedback idempotency, review races and restricted runtime grants. Integration setup deliberately destroys its test schema; never point it at production.

Run `npx playwright install chromium` then `npm run test:browser` for real report/editor rendering and interaction. The browser suite checks retries, literal untrusted text, memory-only editor tokens, review actions, keyboard navigation and 375/768/1280-pixel layouts. CI retains screenshots and traces under test-results.

Unit/fixture success is not a load test, production deployment, live source verification or browser-store release. Keep those acceptance gates distinct.
