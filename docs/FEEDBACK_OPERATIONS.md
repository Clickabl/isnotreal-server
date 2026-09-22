# Feedback intake and editor operations

## User entry points

Website navigation, entity correction links and extension help links converge on `/report`. `/feedback` redirects there. `/help` explains how evidence corrections differ from software feedback. A report does not become a public comment.

The category catalog is `packages/application/src/feedback.ts`. Do not duplicate category enums in a form and forget the database. Migration `0100_feedback_inbox.sql` adds the matching database categories, queue, fingerprint, idempotency and revision fields.

Public receipts include a reference and receipt state, not access to another user's report. The form retains text on a failed request. An uncertain retry reuses its request UUID to avoid multiple rows. Changing the content starts a new request. No contact details or browsing history are collected automatically.

## Editor setup

Run schema migrations as the owner and apply the restricted role grants. Configure `ADMIN_DATABASE_URL`, a random `ADMIN_BEARER_TOKEN` of at least 32 characters, and `ADMIN_ACTOR_ID`. The public runtime must not receive schema-owner credentials or publication signing keys.

Open `/editor` over HTTPS from the protected operator network and unlock with the token. It remains only in the current tab's closure, not localStorage, sessionStorage, a URL, cookie or telemetry. Lock, reload and page exit clear it. Server routes still authorize every request. The UI is not a password manager.

## Reports

Choose evidence/product/safety and state filters. Inspect the literal report text and source URLs, then triage, accept, reject, mark spam or mark a verified duplicate. Rejection/spam/duplicate actions require rationale. Two editors cannot silently overwrite one another: each update carries the version read by that editor and stale updates return 409.

Accepting a report means the report was accepted for follow-up. It does not automatically publish the user's claims or silently change a person's membership. Review evidence using the relevant authoring/import workflow.

## Other workspace tabs

Imports exposes batches and identity exceptions with approved/skipped/rejected row actions and ready/commit controls. Membership exposes pending proposals. Publication checks exposes current validation failures. Empty results are empty query results, not a certification of complete coverage or deployed infrastructure.

## Abuse and privacy

Limit public writes at the managed edge and reverse proxy, then keep Node request limits enabled. Configure trusted immediate proxy addresses explicitly; never enable trust for all forwarded headers. Watch private coarse metrics and report queue volume. Do not place submitted source URLs, narratives, access tokens or source identity data in general access logs.

Spam classification is an editorial action, not an automatic adverse reason about the subject. Source links are not fetched by the report form or intake endpoint. Hostile content must be reviewed as data, never executed.
