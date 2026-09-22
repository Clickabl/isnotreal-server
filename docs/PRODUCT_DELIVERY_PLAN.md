# Product delivery plan

Status: open implementation backlog, not a release announcement.
Audit date: 2026-09-20.
Repositories: Clickabl/isnotreal-server and Clickabl/isnotreal.

The product is a searchable, source-backed website plus an installable browser extension with user-selected causes. A passing backend test suite does not establish a working website, extension, update system, or production deployment.

This document expands the older single-cause scope. Existing runtime contracts remain unchanged until explicitly migrated and tested. Do not describe requirements below as implemented.

## Verified starting point

- The extension README explicitly describes scaffolding only. Its manifest is inert; its background, options, content and platform directories are boundaries rather than working features. TypeScript output is not an installable browser bundle.
- The extension protocol still specifies schema version 1 and ID-only publications. The server protocol is version 4 with identifier/publicEntityId/reasonCodes tuples and a reason-catalog version. The two are not integration-ready.
- Extension FilteringPreferences contains only enabled and hide/replace mode. There is no implemented cause subscription or per-reason policy engine.
- Server apps/web/src/index.ts resolves paths but does not render a homepage or entity page. apps/api/src/runtime.ts mounts JSON public/admin routers, not that website resolver.
- The server has schema, evidence, import/review, alternatives and publication components. These are useful foundations, not evidence of deployed infrastructure or populated production data.
- Existing list decisions and publication channels are not cause-scoped. Person/company categories on reason definitions are not substitutes for causes.
- ops/db-grants.sh currently grants the public runtime role INSERT/UPDATE/DELETE on all tables. This is not an adequate production permission boundary. The handoff scripts also need real shell/PostgreSQL execution tests, not just TypeScript CI.
- No production server, browser-store dashboard, live database contents, browser runtime or installed extension was inspected in this audit.

Evidence locations: companion README.md, apps/extension/manifest.base.json, packages/core/src/index.ts, both packages/protocol/src/index.ts files, server apps/web/src/index.ts, apps/api/src/runtime.ts, docs/data-model.md, and ops/db-grants.sh.

## Product rules

1. Causes are independently selectable. Selecting one cause must not silently enable another.
2. New installations require an explicit selection before filtering. New causes and materially broader criteria stay off until accepted. Existing settings survive updates.
3. Facts, cause membership and a user's chosen action are separate. No global good/bad score or inferred ideology.
4. Multiple independent reasons and causes can apply to one entity. Clearing one reason must not erase another valid reason.
5. A highlight in one cause never silently cancels a filter in another enabled cause.
6. Passive account/domain matching stays local. Publication downloads are not encounter reporting. Explain that a cause-specific download can still reveal that subscription to the delivery service.
7. Evidence, identity details, full source documents and alternatives remain server-side. The compact entry stays identifier, public entity ID and reason codes; cause belongs in the containing publication metadata.
8. Routine content updates and extension software releases are different pipelines. Server-side schema migrations are a third, operator-controlled process.
9. A domain overlay is not hard blocking. Do not ship one as a substitute for the requested pre-request block page.
10. Trusted imports get one auditable batch confirmation; public contributions need review. Identity ambiguities are exceptions, not a reason to stall every unambiguous row.

## Initial cause catalog and factual boundaries

Proposed stable slugs: epstein-records, trump-maga, israel-palestine, russia-ukraine. These are catalog data, not four separate applications.

### Epstein-related records

Support a specifically labeled, opt-in `mentioned in released records` criterion. A verified mention does not establish wrongdoing. Do not label every named person a client, participant in abuse, or offender.

Store the official collection, document identifier or court docket, source URL, page/paragraph locator, document date, retrieval date, disambiguated entity and contextual excerpt. Keep a mention, documented contact, an allegation, a charge and an adjudicated outcome distinct. Preserve denials, corrections and source withdrawals where relevant. Do not automatically target victims, minors, witnesses acting only as witnesses, or private individuals identified by accidental disclosure. Do not undo redactions or redistribute sensitive personal information. Only reviewed, appropriately public records can enter the public filtering dataset.

The public site and replacement UI must show the actual factual label and uncertainty. A search hit or model extraction is a candidate, not an approved identity/evidence match. A removed official document should generate a review event rather than be silently republished from an old capture.

### Trump/MAGA-related public activity

Use attributable public actions such as an explicit endorsement, self-identification, an official campaign role, or a verified financial record where permitted. Record the named campaign/organization, date and source. Do not infer a person's beliefs from appearance, location, religion, an employer, a surname, or private behavior. Do not treat all Republican activity as interchangeable with a specific MAGA-related action. No candidate/public-official scores, rankings or election predictions.

Before ingesting individual contributor data, review source-use restrictions and the product's use case. FEC guidance restricts certain commercial and solicitation uses; public availability is not unrestricted reuse permission. Do not expose contributor addresses or turn individual employee donations into an employer's statement.

### Israel/Palestine

Preserve the existing factual reason distinctions: named letter signatures, explicit statements, military contracts, donations, official boycott/list designations and humanitarian/ceasefire actions. Do not turn a signature into every possible position on the conflict. Nationality, ethnicity, religion and concern for civilians do not establish a military-support claim. Separate person, company, franchisee and ownership attribution.

### Russia/Ukraine

Separate official sanctions designations, documented state ownership/control, military supply, explicit public advocacy, current commercial operations and humanitarian support. Store the actual authority, program, record identifier, effective date and removal history for sanctions data. A fuzzy name match is not an established match. A commercial tie is not automatically support for a war. Russian ancestry, language, citizenship or place of birth alone is not an adverse conduct criterion.

## Required schema and protocol changes

- Add a versioned causes catalog with stable codes/slugs, descriptions, availability and explanatory notices.
- Bind reasons to causes in immutable catalog snapshots. Do not derive cause from P/I/C code prefixes or mutate published reason versions.
- Scope membership decisions, proposals, validation and active-decision uniqueness by entity + cause + list kind. Keep evidence reusable across these decisions.
- Scope publication artifacts, deltas and client version state by cause + platform/domain channel + list kind. A publication batch may still share one database snapshot/catalog version.
- Preserve exact-host versus include-subdomains semantics.
- Preserve public IDs as opaque decimal strings and platform IDs as opaque strings. Never recycle public IDs or guess platform IDs from handles.
- Add source locators and contextual evidence types for record mentions. Add forward-only migrations; do not rewrite applied migrations.
- Model services and individual media works when needed. An actor's evidence must not automatically filter every film unless the user has explicitly enabled a clearly defined association rule.
- Publish shared protocol fixtures tested by both repositories. First reconcile the existing v1/v4 disagreement, then introduce a deliberately versioned cause-aware contract. Do not make new payloads look like old versions.

Illustrative future partition, not a live endpoint:

    /api/v2/lists/{cause}/{channel}/{list}/manifest

The envelope supplies cause, channel, list, protocol version, dataset version, catalog version, timestamps, artifact hashes and signature metadata. Individual entries remain:

    ["platform-id", "public-entity-id", ["reason-code"]]

Do not generate separate datasets for every combination of user settings. Publish reusable partitions and evaluate the selected subset locally.

## Deterministic user policy

Persist global pause, enabled causes, explicit per-reason selections, site permissions, social hide/replace mode, website block/alternative behavior, temporary reveals and remembered exceptions separately from downloaded data.

Evaluation order: verify a usable dataset and stable identity; apply an explicit user exception; collect only enabled cause/reason matches; apply filtering if any selected filter matches; otherwise optionally display a selected highlight; otherwise leave content alone. Unknown or ambiguous identities are unresolved, not guessed matches. Manual allow rules need clearly visible scope: this occurrence, this domain/account, this entity, or all causes.

Disabling one cause immediately removes its local effect and corresponding browser rules, while preserving matches from other enabled causes. New cause criteria cannot silently expand an existing subscription. Settings migration must be tested against old and partially corrupt storage.

## Two update systems to build

### Extension software

Build browser packages, stable extension identifiers, store listings, signed releases, version increments, release notes and upgrade testing. Use normal browser/store delivery for executable code. Safari requires its native packaging/distribution work. Distribution availability must be honest on the website; no invented install links. Browser/user settings and store review control delivery timing.

Do not download or execute replacement adapter JavaScript from our server as a shortcut around store updates. Plain data delivery is separate from executable code delivery.

### Local filtering data

Implement the actual background updater and IndexedDB storage, not only interfaces:

- Bootstrap from a compatible signed bundled snapshot or complete initial download. Show not-ready status until usable data exists.
- Check on startup/wake and randomized schedules, with conditional requests, backoff and a manual update control. No network lookup on each feed item.
- Download selected reusable cause/platform partitions. Offer a separately explained all-partitions privacy mode only if measurements justify its cost.
- Verify signed manifests, hashes, sizes, protocol/catalog versions, expiry and anti-replay state before activation. Checksums alone do not authenticate a dataset.
- Apply bounded deltas or fall back to a full snapshot. Handle deletions, corrected identity assignments, disabled reasons and catalog changes.
- Atomically switch the local active dataset after validation. Journal browser network-rule activation too: IndexedDB and browser rule APIs do not share one transaction.
- Resume safely after a service-worker restart, interrupted download, disk-full error or crash during activation. Never silently leave mixed old/new rule state.
- Keep last-known-good data only under an explicit freshness policy. Expiry, missing initial data and unsupported versions require visible degraded behavior, not a false up-to-date label.
- Show extension version, per-cause data version, last successful sync, stale/error state, coverage, storage usage and Update now.
- Build a signed correction/revocation path and publish monotonically newer corrected generations. Do not defeat replay protection by reinstalling an older manifest.

A transport expiry is not a claim that a historical signature stopped existing. Evidence review and snapshot freshness are separate concerns.

## Open work packages and acceptance gates

All boxes below are open until demonstrated in the relevant runtime.

### Foundation and integration

- [x] F01: Shared protocol v5 public-ID/reason/cause/signature fixtures are enforced across repos, including canonical serializer digests and extension snapshot guards.
- [x] F02: Cause catalog, reason bindings, cause-scoped decisions/publications and candidate projection are implemented and covered by green PostgreSQL delivery tests.
- [x] F03: Local cause/reason evaluation and persisted settings sanitization/migration are implemented and covered by foundation tests.
- [ ] F04: Define availability/coverage separately from membership; unavailable or empty data cannot be displayed as successfully comprehensive.

### Website

- [~] W01: Responsive homepage and honest unavailable-build install section are mounted in the Node runtime; dedicated /download, browser detection and real release links remain.
- [~] W02: Canonical numeric redirects and source-backed entity HTML pages are mounted in the real HTTP runtime; search, richer cause/evidence metadata and correction UI remain.
- [~] W03: Privacy/how-it-works pages and cause-aware homepage copy exist; dedicated cause/reason methodology pages remain.
- [ ] W04: Build public evidence, correction, missing-account and alternative forms with accessible validation, spam controls and success receipts. No direct public publishing.
- [ ] W05: Build alternative browsing, context/region filtering and no-eligible-alternative states. Candidate eligibility must consider all selected causes, not a global positive badge.

### Installable extension and behavior

- [x] E01: Chromium packaging produces a loadable MV3 extension with registered background, popup, options and block-page entry points; packaged Chromium is exercised in CI.
- [x] E02: Onboarding/settings provide independent causes/reasons, permissions, overrides and update state with IndexedDB persistence and restart coverage.
- [~] E03: Extension-owned block page, original navigation, evidence, alternatives and remembered choices are implemented; packaged Chromium restart/allow flow is in final CI verification.
- [~] E04: Pre-request DNR domain blocking and zero-target-request coverage are implemented in packaged Chromium tests; final remembered-allow restart verification is rerunning.
- [ ] E05: Implement X, TikTok, Instagram and YouTube adapters individually. Test stable ID extraction, recycled DOM nodes, SPA navigation, hide/replace/reveal, playback and accidental interaction prevention. Unknown IDs remain unresolved.
- [ ] E06: Package and test Firefox plus Safari macOS/iOS. Publish a capability matrix; native social apps are not covered by a Safari browser extension.
- [ ] E07: Add accessibility, keyboard navigation, localization, reduced motion, local diagnostics and permission-revocation recovery. Do not invent revenue-denied statistics.

### Data updates and releases

- [x] U01: IndexedDB storage, signed full/delta sync, reason dictionaries, rollback-safe staging, restart activation and cached-artifact rehash/repair are implemented and tested.
- [x] U02: Startup/alarm/manual sync, retry backoff, expiry/staleness, partial-failure state and signed removals are implemented and covered by updater/browser tests.
- [ ] U03: Implement isolated signing, key rotation, replay protection and compromised-key recovery in both publisher and client.
- [~] U04: Reproducible Chromium/Firefox packages, reviewed release-candidate workflow and store-update procedure docs are implemented; actual store publication remains an external release action.
- [ ] U05: Deliver immutable artifacts through object storage/CDN; prove cache behavior, compression, origin shielding and recovery under measured rollout load.

### Evidence and editing

- [~] D01: Trusted official-list commit now applies sourced assertions and cause membership in one reviewed batch without redundant per-person membership proposals; preview/undo polish remains.
- [ ] D02: Import the requested official CCFP source with exact row counts and shared evidence, then enrich stable platform identifiers. Do not invent missing IDs or employer affiliations.
- [ ] D03: Add reviewed source adapters and contextual reason definitions for the other causes. Keep protected-person exclusions and documented identity checks in the ingestion path.
- [ ] D04: Build change detection for official source revisions, removals, withdrawals, expired relationships and disputed identity matches. New source content is not automatically true because it was downloaded.
- [ ] D05: Build editor UI for search, evidence editing, reports, batch exceptions, relationships, alternatives and corrections. The current bearer-authenticated router is not this UI.
- [ ] D06: Distinguish stale evidence, current status, allegations and adjudicated findings in public projections as well as publications.

### Production and safety

- [x] O01: Runtime DB role is read-mostly with community-submission inserts only; editor DML and schema-owner roles are separate and admin routes require bearer auth/network isolation at deployment.
- [ ] O02: Execute and test bootstrap/grants/backup/restore scripts against disposable PostgreSQL before the server handoff. Correct SQL/shell escaping and match /healthz and /readyz to the actual runtime.
- [ ] O03: Complete source-fetcher egress isolation and DNS-rebinding protection. A DNS precheck followed by a separately resolving fetch is not sufficient by itself.
- [~] O04: Edge public/write rate limits, connection/body/time budgets, application concurrency/submission backstops and safe release-secret procedures are implemented; retention/load validation remains.
- [ ] O05: Add privacy-reviewed logs/metrics, crash diagnostics, restore drills, rollback instructions and public service status without collecting passive encounter history.
- [ ] O06: Define target browser versions and measured latency, memory, dataset-size and distribution-capacity budgets. A billion-user target is not proof of billion-user readiness.

## Alternatives and privacy: an important integration change

A bare /go-to-alt/{entityId} request cannot know cause choices stored only on the device. Keep it as a generic website route, but do not promise personalized eligibility from that URL alone.

For the extension, retrieve a bounded set of approved candidates with small cause/reason eligibility metadata and evaluate against the user's selections locally before navigation. Alternatively, transmitting a policy selection requires a clearly disclosed opt-in. Never send the original page URL or account ID unnecessarily. Retain one-hop/loop guards, local Allow/Always use alternative settings and a no-safe-candidate result. Do not automatically redirect while scrolling a feed.

## Delivery order

First align contracts and add selectable causes. Then demonstrate one complete vertical slice: homepage/install entry, real browser build, settings, synchronized data, one blocked test domain, block page, evidence page, alternative and local override. Add platform adapters and independent source ingestors after that slice works. Production release also requires the security, source-quality, store, signing and operational gates above.

Do not call the entire product done because a schema migrated, an import ran, a UI screenshot exists or CI passed unit tests. For each completed package record the commit, runtime tested, test evidence, known limitations and whether it is merely implemented, deployed or publicly available.

## UI and abuse audit

- [~] U01: Website navigation, search, causes, downloads, evidence pages, alternatives, privacy/how-it-works and the public feedback surface share one renderer/design system. Continue visual/browser accessibility QA before calling this complete.
- [~] U02: Extension popup, settings, block page, remembered choices, update state, evidence lookup and feedback links share one UI runtime and stylesheet. Social-feed replacement UI remains blocked on the platform adapters.
- [~] U03: Feedback now has one public entry point and one moderation queue for evidence, corrections, identifiers, alternatives, product feedback, bugs, accessibility feedback and abuse reports. Add moderator filtering/triage views for the new categories.
- [~] U04: Public write abuse controls include bounded JSON bodies, application submission throttling, least-privilege DB writes, Nginx per-IP write/public limits, connection limits and server timeouts. Production still needs CDN/WAF configuration, monitoring/alerts and load testing.
- [ ] U05: Add explicit abuse/spam moderation states, duplicate clustering and reviewer actions for malicious or coordinated submissions.
- [ ] U06: Add observability dashboards/alerts for 429/5xx rates, latency, DB pool saturation, publication failures, submission volume and disk/backup health without logging user filter preferences.
- [ ] U07: Run keyboard-only, screen-reader semantics, reduced-motion/contrast and mobile-width QA across every website and extension surface; fix every failure.
- [ ] U08: Remove or update every stale README/TODO/placeholder claim after final feature verification. No scaffold may describe implemented functionality as absent or vice versa.
- [ ] U09: Production threat-model pass covering CDN/origin isolation, admin network restrictions, secret rotation, backup restore, source-fetch SSRF, submission spam, cache poisoning and publication-key compromise.

## Latest active verification

- Extension foundations: `npm run check` is green in CI.
- Chromium packaged-browser suite is mandatory in CI and uploads screenshots/traces on failure.
- Current browser failure is isolated to the one-tab temporary allow navigation race after the block page; the override now uses a tab-scoped `allowAllRequests` rule and waits for rule visibility before navigating, with CI rerunning.
- Server CI is green, including PostgreSQL migrations, signed cause-scoped publications, website/API delivery checks and source/evidence gates.
- Runtime database grants now restrict the public API role to reads plus community-submission inserts; trusted editor DML remains separate.
- Persisted extension snapshots and reason dictionaries are re-hashed against signed descriptors before reuse; corrupted cached labels fall through to signed artifact repair.

## Current implementation pulse

Updated during active build work on 2026-09-20. `[~]` means code exists but the acceptance gate is not yet fully demonstrated.

- Server website is now mounted into the real Node runtime rather than remaining an unused route resolver.
- Apache `.htaccess` and nginx deployment templates proxy canonical numeric entity and alternative routes to the database-backed application; no generated per-entity rewrite map is required.
- Extension protocol is aligned to v4 and extension CI passed after the cause-aware contract migration.
- Cause catalog migrations 0020-0023 introduce independent causes, reason bindings, cause-scoped decisions/publications, settings metadata and a public catalog projection.
- Active work: finish cause-scoping the publication reader/publisher/runtime and get server CI green again, then implement the actual extension sync/storage/background worker.

## External references checked during the audit

These document platform/source constraints, not proof that our product implements them.

- Chrome store updates: https://developer.chrome.com/docs/webstore/update
- Chrome remote-code/data distinction: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- Chrome pre-request rules and limits: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Firefox update distribution: https://extensionworkshop.com/documentation/manage/updating-your-extension/
- Safari distribution: https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension
- Apple automatic app update settings: https://support.apple.com/en-us/102629
- DOJ record privacy and search caveats: https://www.justice.gov/epstein
- FEC contributor-data reuse restrictions: https://www.fec.gov/updates/sale-or-use-contributor-information/
- OFAC downloadable lists/programs: https://ofac.treasury.gov/sanctions-list-service
