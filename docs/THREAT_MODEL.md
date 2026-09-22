# Production threat model

This document is an operational release gate, not a claim that an Internet service can be made impossible to attack.

## Trust boundaries

- Browser preferences and encountered accounts stay local during ordinary filtering.
- Public website/API is untrusted Internet input.
- Admin API is a separate authenticated surface and should also be private-network/VPN/firewall restricted.
- PostgreSQL owner, runtime and editor credentials are separate.
- Publication signing private keys never belong in the public API process or repository.
- Source capture treats remote content and DNS as hostile.

## Required deployment controls

- Put a CDN/WAF or equivalent managed edge in front of the origin. Only the edge/restricted operator network should reach the public origin port.
- Keep PostgreSQL off the public Internet. Require TLS for remote database connections.
- Apply the checked-in Nginx public/write rate and connection limits. Tune them from measured traffic rather than removing them.
- Alert on sustained 429/5xx rates, readiness failures, DB pool saturation, disk pressure, publication failures and abnormal submission volume.
- Do not log extension cause selections, encountered accounts or passive browsing history.
- Rotate database/admin credentials and publication keys using documented overlap. A signing-key compromise requires revoking the key, stopping publication, shipping a client trust update when needed, and republishing clean artifacts.
- Run backup restore drills. A backup that has never restored is not a recovery plan.
- Keep dependency scanning and release checks mandatory.

## Abuse cases

### Submission spam / coordinated reports

Edge write throttling, bounded bodies, application backpressure and a moderation queue prevent direct publication. Moderators can reject/cluster abusive reports. Add provider-level bot/WAF challenges only if measured abuse requires them.

### DDoS / resource exhaustion

The application is not the DDoS perimeter. CDN/WAF, origin isolation, Nginx limits, bounded request bodies/timeouts and the in-process concurrency ceiling are layered controls. Load-test before changing limits.

### Cache poisoning

Immutable publication paths are content/version scoped. Do not cache authenticated admin responses or public write responses. Preserve canonical Host/TLS handling at the edge.

### Source-fetch SSRF / DNS rebinding

Only curated source documents may be fetched. Production egress must restrict destination networks at the network/proxy layer as well as application validation so DNS cannot change between validation and connection.

### Malicious evidence / defamation

A mention, allegation and adjudicated finding are distinct facts. Public submissions never publish directly. Protected/private people and victims require additional review/exclusion rules.

### Extension dataset compromise

Clients verify signed manifests and artifact hashes, enforce replay watermarks, stage before activation and retain the previous verified dataset on failure. Executable extension code updates only through reviewed browser packages/store mechanisms.

## Release drill

Before production launch:

1. Restore the newest DB backup into a disposable database and run readiness plus integrity checks.
2. Simulate a failed/corrupt publication and verify clients retain the previous dataset.
3. Verify origin cannot be reached outside the intended edge/operator network.
4. Exercise 429/503 behavior and confirm no secrets or browsing preferences appear in logs.
5. Exercise admin-token rotation and DB credential rotation.
6. Record rollback commands and responsible operator.
