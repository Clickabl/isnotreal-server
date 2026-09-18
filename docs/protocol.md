# Extension publication protocol

Protocol schema version: **4**.

Normal extension synchronization is privacy-preserving and contains no entity names, biographies, evidence text or source URLs.

A compiled entry is the tuple:

```text
[identifier, publicEntityId, reasonCodes]
```

Example only:

```json
["712345678901", "43212", ["P03"]]
```

The identifier is always an opaque string. Public entity IDs are also serialized as strings even though the database uses `bigint`, avoiding JavaScript integer assumptions and keeping URL construction simple.

Supported publication channels currently are `x`, `tiktok`, `instagram`, `youtube`, `domain` (exact hostname), and `domain-subdomains` (hostname subtree). Each channel has independent `filter` and `highlight` lists.

`GET /api/v1/reasons/compact` serves the extension's tiny active code→label dictionary separately from identifier lists. `GET /api/v1/reasons` and `/api/v1/reasons/{code}` expose the full public qualification criteria, campaign bindings and authority sources for the website/research UI.

The extension can construct `https://isnotreal.click/{publicEntityId}` for an explicit Why/details action. The website resolves that stable ID to the current canonical slug. The extension does not need a reverse platform-ID lookup endpoint.

Alternatives are intentionally online/dynamic. `/go-to-alt/{publicEntityId}` returns a temporary redirect to the current approved preferred alternative. Alternative lookup is opt-in behavior and is not part of passive feed matching.

Every manifest/full snapshot/delta carries `reasonCatalogVersion`. Clients must ensure they have the matching compact reason dictionary before rendering a code. Full snapshots and deltas are immutable publication artifacts. In a delta, `added` entries are **upserts**: an identifier appears there when it is new or when its public entity/reason codes changed. `removed` contains identifiers that should be deleted locally.

The database schema records hashes, sizes, publication provenance, reason-catalog version and future signing metadata; cryptographic artifact signing is still a later deployment layer.
