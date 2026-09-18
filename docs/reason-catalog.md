# Reason Catalog v1

The reason catalog is the public vocabulary used by isnotreal.click to explain why an entity is eligible for a filter or highlight list.

## Design rules

1. **Describe verifiable conduct, not identity or ideology.** Codes record specific statements, signatures, donations, contracts, official-list membership, or other documented actions.
2. **A code means only what its label says.** A specific campaign signature must not be expanded into unrelated positions.
3. **Exact attribution matters.** Personal statements are not corporate statements. Franchisee conduct is not automatically parent-company conduct. Ownership may be shown as context but does not copy a parent's reason onto a subsidiary.
4. **Historical facts are preserved.** A past signature, donation, or statement remains in the evidence timeline even if a later position changes.
5. **Current facts must be re-verified.** Active contracts, current corporate target lists, current settlement operations, and similar status claims have review windows.
6. **The extension receives only compact reason codes.** Full criteria, sources, evidence, corrections, and disputes remain on the server/website.
7. **Default filter/highlight status is a publication-policy setting, not part of the factual claim itself.**

## Evidence standards

Each reason has a machine-readable qualification record in `reason_evidence_requirements`.

A source can qualify as primary/authoritative when it is, for example:

- the subject's own attributable statement, post, recording, filing, or official website;
- an official named-campaign signatory/participant list;
- an official recipient/fundraiser record;
- a contract, procurement record, regulatory filing, or company disclosure;
- an official intergovernmental/government database or report.

High-quality secondary reporting can corroborate a fact, but should not replace an official/primary record for codes marked `primary_or_authoritative_required`.

The following are not sufficient by themselves:

- unattributed screenshots;
- social-media crowd lists;
- likes, follows, or algorithmic recommendations;
- inferred political ideology;
- nationality, ethnicity, religion, or place of birth;
- a cancellation with no documented reason;
- an employee's conduct attributed to an employer without evidence;
- a parent company's conduct automatically copied onto every subsidiary or brand.

## Validity modes

- `historical-event`: the action happened and does not expire. Later changes are added to the timeline.
- `current-status`: describes a policy/status that must still be current.
- `current-list-membership`: must remain on the applicable captured official list.
- `current-relationship`: contract/supply/operation/financial relationship must be periodically re-verified.

The compiler excludes stale current-status reasons from extension publications when their `last_verified_at` exceeds the catalog's re-verification window. The evidence remains available on the public entity page.

## Person highlight reasons

| Code | Display label |
| --- | --- |
| P01 | Publicly advocated for Palestinian rights |
| P02 | Publicly called for a Gaza ceasefire |
| P03 | Signed Artists4Ceasefire |
| P04 | Signed Film Workers for Palestine pledge |
| P05 | Joined No Music for Genocide |
| P06 | Boycotted Israeli institutions |
| P07 | Withdrew in Palestine solidarity |
| P08 | Participated in a Palestine solidarity event |
| P09 | Raised funds for Palestinian relief |
| P10 | Donated to Palestinian relief |
| P11 | Released Palestine-focused creative work |
| P12 | Publicly criticized Israeli military actions |
| P13 | Publicly opposed occupation or settlements |
| P14 | Took another documented Palestine solidarity action |

## Person filter reasons

| Code | Display label |
| --- | --- |
| I01 | Publicly expressed support for Israel in the conflict |
| I02 | Signed the October 2023 CCFP Israel letter |
| I03 | Publicly supported Israeli military action |
| I04 | Raised funds for an IDF-related organization |
| I05 | Donated to an IDF-related organization |
| I06 | Participated in an IDF support fundraiser or event |
| I07 | Publicly encouraged support for the IDF |
| I08 | Performed at an IDF support event |
| I09 | Publicly opposed a Gaza ceasefire |
| I10 | Publicly opposed a Palestine boycott or solidarity campaign |
| I11 | Publicly defended Israeli government Gaza policy |
| I12 | Publicly opposed Palestinian statehood or self-determination |

## Company/organization highlight reasons

| Code | Display label |
| --- | --- |
| CP01 | Publicly called for a Gaza ceasefire |
| CP02 | Donated to Palestinian humanitarian relief |
| CP03 | Raised funds for Palestinian humanitarian relief |
| CP04 | Ended a relevant Israeli military contract |
| CP05 | Divested from a documented boycott or divestment target |
| CP06 | Ended settlement-related business activity |
| CP07 | Joined a documented Palestine solidarity campaign |
| CP08 | Refuses business with Israeli settlements |
| CP09 | Participates in a documented Palestine-related boycott |

## Company/brand filter reasons

| Code | Display label |
| --- | --- |
| C01 | Supplies weapons or military equipment to Israel |
| C02 | Supplies components used in Israeli military systems |
| C03 | Provides cloud, AI, or technology services to Israeli military |
| C04 | Provides surveillance or security technology used in occupied Palestinian territory |
| C05 | Provides infrastructure or services to Israeli military |
| C06 | Donated goods or services to Israeli military personnel |
| C07 | Donated money to an IDF-related organization |
| C08 | Fundraised for an IDF-related organization |
| C09 | Operates in Israeli settlements in occupied territory |
| C10 | Provides services or infrastructure to Israeli settlements |
| C11 | Supplies settlement construction or expansion |
| C12 | Extracts or uses resources from occupied Palestinian territory |
| C13 | Listed in UN settlement-business database |
| C14 | BDS consumer boycott priority target |
| C15 | BDS pressure target |
| C16 | BDS divestment or exclusion target |
| C17 | Israeli military or security contractor |
| C18 | Israeli government contractor for relevant military or security activity |
| C19 | Invests in companies supplying Israeli military |
| C20 | Finances companies supplying Israeli military |
| C21 | Company officially supported Israeli military action |
| C22 | Senior company leadership publicly supported Israeli military action |
| C23 | Provided wartime material support to Israeli state or military |
| C24 | Other documented settlement involvement |
| C25 | BDS organic boycott target |

## Named campaign and authority bindings

The database seeds official source records and campaign bindings for:

- **Artists4Ceasefire** → `P03`
- **Film Workers for Palestine pledge** → `P04`
- **No Music For Genocide** → `P05`
- **Creative Community for Peace October 12, 2023 open letter** → `I02`
- **BDS corporate priority targeting** → `C14`, `C15`, `C16`, `C25`
- **OHCHR settlement-related business-enterprise database/update** → `C13`

The BDS categories are intentionally distinct. The official guide separates consumer boycott priority targets, organic boycott targets, pressure targets, and divestment/exclusion work. The database must preserve the category actually assigned by the official source rather than collapsing them into a generic "BDS target" label.

## Financial reason hold

`C19` and `C20` require a separately published materiality methodology before they should be used for production membership decisions. The evidence rules explicitly reject tiny or stale exposure being treated as equivalent to a strategic investment or financing relationship.

## Catalog versioning

Reason catalog v1 is snapshotted in `reason_catalog_versions` and `reason_catalog_entries`.

Existing catalog versions are immutable public history. If labels or qualification standards materially change, create and activate a new catalog version rather than silently mutating v1.

## Adding a new reason

A new reason should be added only when:

1. a recurring factual action cannot be accurately represented by an existing code;
2. the display label can be stated without an ideological or moral conclusion;
3. qualification and exclusion criteria can be written clearly;
4. the evidence mode and validity mode are defined;
5. named campaigns/authorities are bound where applicable;
6. tests cover the new catalog count/code and any publication behavior.

Do not create a new reason merely because a new person or company is controversial. Add evidence to an existing factual reason whenever that is accurate.
