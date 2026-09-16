# Data model

The server keeps a rich normalized evidence graph and publishes a deliberately tiny extension projection.

```text
Entity
  -> names/aliases
  -> identifier assignments -> identifier (TikTok/X/Instagram/YouTube/domain/...)
  -> relationships -> other entities
  -> assertion participation

Assertion
  -> campaign version (optional)
  -> source capture(s) -> reusable source document
  -> reason definition(s)

Policy revision
  -> membership decision (filter/highlight/include/exclude)
  -> membership decision reasons -> assertion + reason code

Membership decisions + current verified identifiers
  -> publication_candidates view
  -> compiler
  -> [identifier, publicEntityId, reasonCodes]
```

## Entities and identifiers

One entity can have unlimited domains/accounts. `identifiers` stores the stable external identifier; `identifier_assignments` stores which entity controls it and preserves reassignment history. Handles and display names are not authoritative matching keys.

Domains are hostnames, not URLs. Exact-host and include-subdomain matching are explicit. `www.example.com` is not silently rewritten to `example.com`.

## Assertions, campaigns and sources

Campaigns are data, not schema. A signer assertion can use `action_type = signed-letter` plus a `campaign_version_id`, allowing named campaigns to evolve without adding database enums/migrations.

A source document can support thousands of assertions. Captures are immutable observations of that source at a retrieval time; links record which capture supports or contradicts an assertion.

## Reasons and policy

Reason codes are short human-facing labels suitable for the extension block/highlight card. The full explanation and receipts live on the entity page. A reason code does not itself decide whether an entity belongs on a list.

Membership decisions are separately reviewed outputs of a policy revision. Both filter and highlight evidence may coexist; the database does not collapse them into a score.

## Alternatives

Alternatives are reviewed many-to-many relationships between entities with a context key and rank. Destination URLs are separately verified. The preferred-alternative query excludes entities that currently have an active filter inclusion decision.

## Reports and community submissions

Users can submit positive/negative evidence, corrections, account/domain fixes, company relationships, new entities and alternative suggestions. Submissions never mutate assertions, reasons or memberships directly.

## Publication

The `publication_candidates` view is intentionally lossy. It includes only channel, list kind, normalized identifier, public entity ID and reason codes. Full entity data remains server-side and powers `/{slug}` pages.
