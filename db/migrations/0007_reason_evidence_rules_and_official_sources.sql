BEGIN;

-- Reason catalog metadata and official source/campaign registry.
-- This migration does not add people or companies to filter/highlight lists.
-- It defines how a reason must be proven before a reviewer may use it.

CREATE TABLE reason_evidence_requirements (
  reason_code text PRIMARY KEY REFERENCES reason_definitions(code) ON DELETE CASCADE,
  subject_scope text NOT NULL CHECK (subject_scope IN ('person', 'company', 'organization', 'any')),
  evidence_mode text NOT NULL CHECK (evidence_mode IN (
    'public-statement',
    'named-campaign-membership',
    'documented-action',
    'authoritative-list',
    'contract-or-supply',
    'financial-relationship',
    'organizational-policy',
    'leadership-attribution',
    'other'
  )),
  validity_mode text NOT NULL CHECK (validity_mode IN (
    'historical-event',
    'current-status',
    'current-list-membership',
    'current-relationship'
  )),
  public_criteria text NOT NULL CHECK (length(btrim(public_criteria)) > 0),
  exclusion_criteria text NOT NULL DEFAULT '',
  primary_or_authoritative_required boolean NOT NULL DEFAULT false,
  minimum_evidence_items smallint NOT NULL DEFAULT 1 CHECK (minimum_evidence_items BETWEEN 1 AND 10),
  reverify_after_days integer NULL CHECK (reverify_after_days IS NULL OR reverify_after_days > 0),
  inheritance_policy text NOT NULL DEFAULT 'none' CHECK (
    inheritance_policy IN ('none', 'relationship-context-only')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE reason_evidence_requirements IS
  'Qualification rules for reason codes. Facts are not inferred from ideology, nationality, ownership, or adjacent conduct unless a rule explicitly permits relationship context.';

CREATE TABLE reason_campaign_bindings (
  reason_code text NOT NULL REFERENCES reason_definitions(code) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  membership_role text NOT NULL CHECK (length(btrim(membership_role)) > 0),
  assertion_action_type text NOT NULL CHECK (length(btrim(assertion_action_type)) > 0),
  PRIMARY KEY (reason_code, campaign_id)
);

CREATE TABLE reason_authority_sources (
  reason_code text NOT NULL REFERENCES reason_definitions(code) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  authority_role text NOT NULL CHECK (authority_role IN (
    'canonical-campaign-record',
    'authoritative-list',
    'official-guidance',
    'methodology'
  )),
  PRIMARY KEY (reason_code, source_document_id, authority_role)
);

-- BDS distinguishes four different corporate target categories. The original
-- v1 draft omitted the "organic boycott" category; add it without renumbering
-- any existing stable codes.
INSERT INTO reason_definitions (code, label, description, category, default_list)
VALUES (
  'C25',
  'BDS organic boycott target',
  'The Palestinian BDS National Committee currently identifies the company or brand as an organic boycott target: a grassroots boycott campaign not initiated by BDS that BDS officially supports.',
  'company-negative',
  'filter'
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_list = EXCLUDED.default_list,
  active = true,
  updated_at = now();

-- Official source registry. These are authority/source records only, not
-- assertions that any particular person or company qualifies for a reason.
INSERT INTO source_documents (
  canonical_url, title, publisher, source_type, first_published_at
) VALUES
  (
    'https://www.artists4ceasefire.org/',
    'Artists4Ceasefire official site and signatory list',
    'Artists4Ceasefire',
    'campaign',
    NULL
  ),
  (
    'https://filmworkersforpalestine.org/',
    'Film Workers for Palestine pledge and signatory list',
    'Film Workers for Palestine',
    'campaign',
    NULL
  ),
  (
    'https://nomusicforgenocide.org/',
    'No Music For Genocide official artist and label list',
    'No Music For Genocide',
    'campaign',
    NULL
  ),
  (
    'https://www.creativecommunityforpeace.com/blog/2023/10/12/israel-under-attack-open-letter/',
    'Israel Under Attack – Open Letter',
    'Creative Community for Peace',
    'campaign',
    '2023-10-12T00:00:00Z'
  ),
  (
    'https://bdsmovement.net/Guide-to-BDS-Boycott',
    'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
    'Palestinian BDS National Committee',
    'campaign',
    '2024-12-06T00:00:00Z'
  ),
  (
    'https://www.ohchr.org/sites/default/files/documents/hrbodies/hrcouncil/sessions-regular/session31/database-hrc3136/23-06-30-Update-israeli-settlement-opt-database-hrc3136.pdf',
    'OHCHR update of database of business enterprises involved in listed settlement-related activities',
    'Office of the United Nations High Commissioner for Human Rights',
    'primary',
    '2023-06-30T00:00:00Z'
  )
ON CONFLICT (canonical_url) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  source_type = EXCLUDED.source_type,
  first_published_at = COALESCE(EXCLUDED.first_published_at, source_documents.first_published_at),
  updated_at = now();

INSERT INTO campaigns (slug, name, website_url, status, launched_on)
VALUES
  ('artists4ceasefire', 'Artists4Ceasefire', 'https://www.artists4ceasefire.org/', 'active', NULL),
  ('film-workers-for-palestine-pledge', 'Film Workers for Palestine pledge', 'https://filmworkersforpalestine.org/', 'active', NULL),
  ('no-music-for-genocide', 'No Music For Genocide', 'https://nomusicforgenocide.org/', 'active', NULL),
  ('ccfp-october-2023-open-letter', 'CCFP October 2023 Israel open letter', 'https://www.creativecommunityforpeace.com/blog/2023/10/12/israel-under-attack-open-letter/', 'ended', '2023-10-12'),
  ('bds-corporate-priority-targeting', 'BDS corporate priority targeting', 'https://bdsmovement.net/Guide-to-BDS-Boycott', 'active', NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  status = EXCLUDED.status,
  launched_on = COALESCE(EXCLUDED.launched_on, campaigns.launched_on),
  updated_at = now();

INSERT INTO campaign_versions (
  campaign_id, version, label, source_document_id, effective_from
)
SELECT c.id, 1, seed.label, sd.id, seed.effective_from
FROM (
  VALUES
    ('artists4ceasefire', 'Official signatory list, initial registry version', 'https://www.artists4ceasefire.org/', NULL::timestamptz),
    ('film-workers-for-palestine-pledge', 'Official pledge/signatory list, initial registry version', 'https://filmworkersforpalestine.org/', NULL::timestamptz),
    ('no-music-for-genocide', 'Official artist/label boycott list, initial registry version', 'https://nomusicforgenocide.org/', NULL::timestamptz),
    ('ccfp-october-2023-open-letter', 'October 12, 2023 open letter', 'https://www.creativecommunityforpeace.com/blog/2023/10/12/israel-under-attack-open-letter/', '2023-10-12T00:00:00Z'::timestamptz),
    ('bds-corporate-priority-targeting', 'Corporate priority targeting guide, initial registry version', 'https://bdsmovement.net/Guide-to-BDS-Boycott', '2024-12-06T00:00:00Z'::timestamptz)
) AS seed(campaign_slug, label, source_url, effective_from)
JOIN campaigns c ON c.slug = seed.campaign_slug
JOIN source_documents sd ON sd.canonical_url = seed.source_url
ON CONFLICT (campaign_id, version) DO UPDATE SET
  label = EXCLUDED.label,
  source_document_id = EXCLUDED.source_document_id,
  effective_from = COALESCE(EXCLUDED.effective_from, campaign_versions.effective_from);

INSERT INTO reason_campaign_bindings (
  reason_code, campaign_id, membership_role, assertion_action_type
)
SELECT seed.reason_code, c.id, seed.membership_role, seed.action_type
FROM (
  VALUES
    ('P03', 'artists4ceasefire', 'signer', 'signed-open-letter'),
    ('P04', 'film-workers-for-palestine-pledge', 'signer', 'signed-pledge'),
    ('P05', 'no-music-for-genocide', 'participant', 'geo-blocked-or-removed-music'),
    ('I02', 'ccfp-october-2023-open-letter', 'signer', 'signed-open-letter'),
    ('C14', 'bds-corporate-priority-targeting', 'consumer-boycott-priority-target', 'listed-by-campaign'),
    ('C25', 'bds-corporate-priority-targeting', 'organic-boycott-target', 'listed-by-campaign'),
    ('C15', 'bds-corporate-priority-targeting', 'pressure-target', 'listed-by-campaign'),
    ('C16', 'bds-corporate-priority-targeting', 'divestment-or-exclusion-target', 'listed-by-campaign')
) AS seed(reason_code, campaign_slug, membership_role, action_type)
JOIN campaigns c ON c.slug = seed.campaign_slug
ON CONFLICT (reason_code, campaign_id) DO UPDATE SET
  membership_role = EXCLUDED.membership_role,
  assertion_action_type = EXCLUDED.assertion_action_type;

INSERT INTO reason_authority_sources (reason_code, source_document_id, authority_role)
SELECT seed.reason_code, sd.id, seed.authority_role
FROM (
  VALUES
    ('P03', 'https://www.artists4ceasefire.org/', 'canonical-campaign-record'),
    ('P04', 'https://filmworkersforpalestine.org/', 'canonical-campaign-record'),
    ('P05', 'https://nomusicforgenocide.org/', 'canonical-campaign-record'),
    ('I02', 'https://www.creativecommunityforpeace.com/blog/2023/10/12/israel-under-attack-open-letter/', 'canonical-campaign-record'),
    ('C13', 'https://www.ohchr.org/sites/default/files/documents/hrbodies/hrcouncil/sessions-regular/session31/database-hrc3136/23-06-30-Update-israeli-settlement-opt-database-hrc3136.pdf', 'authoritative-list'),
    ('C14', 'https://bdsmovement.net/Guide-to-BDS-Boycott', 'authoritative-list'),
    ('C25', 'https://bdsmovement.net/Guide-to-BDS-Boycott', 'authoritative-list'),
    ('C15', 'https://bdsmovement.net/Guide-to-BDS-Boycott', 'authoritative-list'),
    ('C16', 'https://bdsmovement.net/Guide-to-BDS-Boycott', 'official-guidance')
) AS seed(reason_code, source_url, authority_role)
JOIN source_documents sd ON sd.canonical_url = seed.source_url
ON CONFLICT DO NOTHING;

-- Explicit qualification standards. "Primary or authoritative" means an
-- official campaign/list, direct statement/post/recording, contract/filing,
-- recipient acknowledgement, or equivalent primary record. It does not mean
-- that unattributed screenshots or crowd claims are accepted.
INSERT INTO reason_evidence_requirements (
  reason_code, subject_scope, evidence_mode, validity_mode,
  public_criteria, exclusion_criteria,
  primary_or_authoritative_required, minimum_evidence_items,
  reverify_after_days, inheritance_policy
) VALUES
  ('P01','person','public-statement','historical-event',
   'The person explicitly advocated Palestinian rights, freedom, equality, or self-determination in a source attributable to that person.',
   'Do not qualify from generic humanitarian sympathy, inferred ideology, clothing/symbols alone, likes/follows alone, or another person''s characterization.',
   false,1,NULL,'none'),
  ('P02','person','public-statement','historical-event',
   'The person explicitly called for a ceasefire or immediate cessation of hostilities in Gaza/Israel.',
   'Do not infer from calls for aid, hostage release, de-escalation, or peace unless a ceasefire/cessation is explicit.',
   false,1,NULL,'none'),
  ('P03','person','named-campaign-membership','historical-event',
   'The person appears on the official Artists4Ceasefire signatory record for the applicable captured campaign version.',
   'Name similarity alone is insufficient when identity is ambiguous. Removal from a later list does not erase a previously verified historical signature; record withdrawal separately if documented.',
   true,1,NULL,'none'),
  ('P04','person','named-campaign-membership','historical-event',
   'The person appears on the official Film Workers for Palestine pledge signatory record for the applicable captured campaign version.',
   'Do not infer pledge membership from support for another campaign or from press coverage that does not identify the person as a signer.',
   true,1,NULL,'none'),
  ('P05','person','named-campaign-membership','historical-event',
   'The artist or label appears on the official No Music For Genocide participant record after the campaign''s stated geo-block/removal confirmation process.',
   'Do not qualify merely because music is unavailable in a territory for unrelated licensing reasons.',
   true,1,NULL,'none'),
  ('P06','person','documented-action','historical-event',
   'The person took a documented boycott/refusal action toward an Israeli institution and explicitly connected that action to Palestine-related criteria.',
   'Do not infer motive from a cancellation, scheduling conflict, licensing issue, or non-participation with no documented Palestine-related explanation.',
   false,1,NULL,'none'),
  ('P07','person','documented-action','historical-event',
   'The person withdrew from a performance, event, partnership, production, or commitment and explicitly connected the withdrawal to Palestine solidarity or a named related campaign.',
   'A cancellation without an explicit documented reason does not qualify.',
   false,1,NULL,'none'),
  ('P08','person','documented-action','historical-event',
   'The person is documented as participating, speaking, organizing, or performing at a Palestine solidarity rally, protest, benefit, teach-in, or advocacy event.',
   'Attendance inferred only from location, crowd photos, or third-party speculation does not qualify.',
   false,1,NULL,'none'),
  ('P09','person','documented-action','historical-event',
   'The person organized or materially promoted a fundraiser whose stated beneficiary was Palestinian humanitarian relief.',
   'Merely reposting unrelated humanitarian content or donating privately without a verifiable record does not qualify this fundraising code.',
   false,1,NULL,'none'),
  ('P10','person','documented-action','historical-event',
   'A primary recipient record, donor statement, fundraiser record, or reliable corroboration documents a donation or proceeds directed by the person to Palestinian humanitarian relief.',
   'Unverified donation claims and estimates do not qualify.',
   false,1,NULL,'none'),
  ('P11','person','documented-action','historical-event',
   'The person released a creative work whose text, official description, or creator statement explicitly addresses Palestine or Palestinian rights.',
   'Fan interpretation alone does not qualify.',
   false,1,NULL,'none'),
  ('P12','person','public-statement','historical-event',
   'The person explicitly criticized a specific Israeli military action, operation, tactic, or pattern of military conduct affecting Palestinians.',
   'Criticism of an Israeli politician, party, or unrelated domestic policy alone does not qualify.',
   false,1,NULL,'none'),
  ('P13','person','public-statement','historical-event',
   'The person explicitly opposed Israeli occupation or settlement activity in occupied Palestinian territory.',
   'General support for peace or a two-state outcome without an explicit statement about occupation/settlements does not qualify.',
   false,1,NULL,'none'),
  ('P14','person','other','historical-event',
   'A reviewed, source-backed Palestine solidarity action exists but no narrower positive person reason accurately describes it.',
   'Do not use as a convenience code when a narrower reason exists; reviewer must explain why no specific code applies.',
   false,1,NULL,'none'),

  ('I01','person','public-statement','historical-event',
   'The person explicitly expressed support for Israel in the Israel-Palestine conflict in an attributable public statement.',
   'Sympathy for Israeli civilian victims, condemnation of antisemitism, or calls to release hostages alone do not automatically qualify unless the source also explicitly expresses support for Israel in the conflict.',
   false,1,NULL,'none'),
  ('I02','person','named-campaign-membership','historical-event',
   'The person appears on the official October 12, 2023 Creative Community for Peace open-letter signatory record.',
   'Do not attribute the person''s employer or affiliated company as a signer; the official letter states signers act as individuals.',
   true,1,NULL,'none'),
  ('I03','person','public-statement','historical-event',
   'The person explicitly supported an Israeli military operation, tactic, strike campaign, or use of military force affecting Gaza or Palestinians.',
   'Generic support for Israel, sympathy for victims, condemnation of Hamas, or hostage advocacy alone does not qualify this narrower military-action code.',
   false,1,NULL,'none'),
  ('I04','person','documented-action','historical-event',
   'The person organized or materially promoted fundraising whose stated beneficiary was the IDF or an organization providing material support to Israeli military personnel.',
   'General Israeli civilian relief or hostage-family fundraising does not qualify unless the military beneficiary is documented.',
   false,1,NULL,'none'),
  ('I05','person','documented-action','historical-event',
   'A recipient record, donor statement, fundraiser record, or reliable corroboration documents a donation to the IDF or an organization providing material support to Israeli military personnel.',
   'General civilian relief, Israeli charities with no military-support purpose, and unverified donation claims do not qualify.',
   false,1,NULL,'none'),
  ('I06','person','documented-action','historical-event',
   'The person is documented as participating in a fundraiser, benefit, or event whose stated purpose included material or financial support for the IDF or Israeli military personnel.',
   'Mere attendance at an Israel-related cultural or hostage event does not qualify without the military-support purpose.',
   false,1,NULL,'none'),
  ('I07','person','public-statement','historical-event',
   'The person explicitly encouraged financial, material, political, or other support for the IDF.',
   'Generic support for Israel or condemnation of Hamas does not qualify unless the IDF support is explicit.',
   false,1,NULL,'none'),
  ('I08','person','documented-action','historical-event',
   'The person performed or appeared as featured talent at an event whose stated purpose included support for the IDF or Israeli military personnel.',
   'An event concerning Israel, antisemitism, hostages, or civilian relief does not qualify without the military-support purpose.',
   false,1,NULL,'none'),
  ('I09','person','public-statement','historical-event',
   'The person explicitly opposed a proposed or general ceasefire in Gaza.',
   'Arguments about ceasefire terms, hostage conditions, or enforcement do not qualify unless the person actually opposes the ceasefire being described.',
   false,1,NULL,'none'),
  ('I10','person','public-statement','historical-event',
   'The person explicitly opposed a specific Palestine solidarity, boycott, divestment, or sanctions campaign or took an attributable advocacy action against it.',
   'Criticism of one tactic does not automatically establish opposition to every Palestine solidarity campaign.',
   false,1,NULL,'none'),
  ('I11','person','public-statement','historical-event',
   'The person explicitly defended an Israeli government policy or course of action in Gaza.',
   'Generic support for Israel or criticism of Hamas does not qualify without defense of the specific government policy/action.',
   false,1,NULL,'none'),
  ('I12','person','public-statement','historical-event',
   'The person explicitly opposed Palestinian statehood or Palestinian national self-determination.',
   'Support for a particular negotiation framework or criticism of a specific Palestinian government does not qualify by itself.',
   false,1,NULL,'none'),

  ('CP01','company','organizational-policy','historical-event',
   'An official company/organization channel called for a ceasefire in Gaza.',
   'Statements made personally by an employee or executive are not company statements unless the organization adopts or publishes them officially.',
   true,1,NULL,'none'),
  ('CP02','company','documented-action','historical-event',
   'An official company record, recipient record, or reliable corroboration documents a donation of money, goods, services, or proceeds to Palestinian humanitarian relief.',
   'Employee donations and unrelated corporate philanthropy do not qualify the company.',
   false,1,NULL,'none'),
  ('CP03','company','documented-action','historical-event',
   'The company organized or materially promoted fundraising whose stated beneficiary was Palestinian humanitarian relief.',
   'Employee-led activity does not qualify unless officially adopted/sponsored by the company.',
   false,1,NULL,'none'),
  ('CP04','company','contract-or-supply','historical-event',
   'Reliable documentation establishes that the company ended or declined to renew a relevant Israeli military contract and identifies the contract or service.',
   'Rumors, bids not won, or a contract expiring for unrelated reasons do not qualify unless the ending/non-renewal is documented.',
   true,1,NULL,'none'),
  ('CP05','company','financial-relationship','historical-event',
   'Reliable documentation establishes a divestment from a documented Palestine-related boycott/divestment target and identifies the divested holding.',
   'Ordinary portfolio turnover without documented divestment action does not qualify.',
   true,1,NULL,'none'),
  ('CP06','company','documented-action','historical-event',
   'Reliable documentation establishes that the company ended a specific business activity connected to Israeli settlements in occupied Palestinian territory.',
   'Sale/restructuring does not qualify unless the relevant activity actually ceased for the entity being described.',
   true,1,NULL,'none'),
  ('CP07','company','named-campaign-membership','historical-event',
   'The company/organization appears on the official participant or endorser record of a named Palestine solidarity campaign.',
   'An employee''s participation does not qualify the company unless the campaign record names the company/organization itself.',
   true,1,NULL,'none'),
  ('CP08','company','organizational-policy','current-status',
   'The company has a current, documented policy refusing relevant business with Israeli settlements in occupied Palestinian territory.',
   'One past refusal does not establish a standing policy.',
   true,1,365,'none'),
  ('CP09','company','documented-action','historical-event',
   'The company/organization took a documented boycott action under stated Palestine-related criteria.',
   'Routine market exit, sanctions compliance unrelated to the campaign, or unavailable service without documented boycott intent does not qualify.',
   false,1,NULL,'none'),

  ('C01','company','contract-or-supply','current-relationship',
   'Reliable primary/official records document supply of weapons, munitions, military platforms, or military equipment to Israel or the Israeli military.',
   'Civilian products with only speculative military use do not qualify.',
   true,1,180,'none'),
  ('C02','company','contract-or-supply','current-relationship',
   'Reliable records identify a component supplied by the company and the Israeli military weapon/platform/system into which it is incorporated.',
   'General supply-chain proximity or dual-use capability without a documented system connection does not qualify.',
   true,1,180,'none'),
  ('C03','company','contract-or-supply','current-relationship',
   'Reliable records document cloud, AI, data, software, or technology services provided by the company to the Israeli military.',
   'A contract with an unrelated Israeli civilian agency or ordinary consumer availability in Israel does not qualify.',
   true,1,180,'none'),
  ('C04','company','contract-or-supply','current-relationship',
   'Reliable records document surveillance, biometric, policing, or security technology supplied by the company and used in occupied Palestinian territory.',
   'A product''s theoretical capability or use in unrelated jurisdictions does not qualify.',
   true,1,180,'none'),
  ('C05','company','contract-or-supply','current-relationship',
   'Reliable records document infrastructure, logistics, communications, maintenance, professional services, or other operational support provided to the Israeli military.',
   'Ordinary civilian commerce with Israel does not qualify.',
   true,1,180,'none'),
  ('C06','company','documented-action','historical-event',
   'An official company/franchise record, recipient record, or reliable corroboration documents donation of goods or services to Israeli military personnel.',
   'An independently owned franchisee action must be attributed to that franchisee/entity unless evidence establishes parent-company adoption or responsibility.',
   false,1,NULL,'none'),
  ('C07','company','documented-action','historical-event',
   'An official record, recipient record, or reliable corroboration documents company donation of money/proceeds to the IDF or an organization providing material support to Israeli military personnel.',
   'Employee donations and civilian-only relief do not qualify the company.',
   false,1,NULL,'none'),
  ('C08','company','documented-action','historical-event',
   'The company officially organized or materially promoted fundraising for the IDF or an organization providing material support to Israeli military personnel.',
   'Independent employee fundraising does not qualify unless officially adopted/sponsored by the company.',
   false,1,NULL,'none'),
  ('C09','company','contract-or-supply','current-relationship',
   'Reliable records document current company operations, locations, production, or commercial activity in Israeli settlements in occupied Palestinian territory.',
   'Historical activity that has verifiably ended should remain in history but not be represented as current.',
   true,1,365,'none'),
  ('C10','company','contract-or-supply','current-relationship',
   'Reliable records document services or infrastructure supplied by the company to Israeli settlements in occupied Palestinian territory.',
   'Services to Israel generally do not qualify without a documented settlement connection.',
   true,1,365,'none'),
  ('C11','company','contract-or-supply','current-relationship',
   'Reliable records document construction, engineering, materials, equipment, or related services used for Israeli settlement construction or expansion.',
   'General construction activity in Israel does not qualify without a settlement-project connection.',
   true,1,365,'none'),
  ('C12','company','contract-or-supply','current-relationship',
   'Reliable records document extraction, exploitation, or commercial use by the company of natural resources from occupied Palestinian territory.',
   'Indirect downstream use without a documented extraction/commercial relationship does not qualify.',
   true,1,365,'none'),
  ('C13','company','authoritative-list','current-list-membership',
   'The company appears in the captured applicable OHCHR database/report of business enterprises involved in specified settlement-related activities.',
   'Do not continue to describe an entity as currently listed after an authoritative later update removes it; preserve the historical listing in the timeline.',
   true,1,365,'none'),
  ('C14','company','authoritative-list','current-list-membership',
   'The company/brand appears in the captured current BDS guide as a consumer boycott priority target.',
   'Do not infer this category from social-media boycott lists or from another BDS category.',
   true,1,90,'none'),
  ('C15','company','authoritative-list','current-list-membership',
   'The company/brand appears in the captured current BDS guide as a pressure target.',
   'Pressure target does not mean BDS calls for an unconditional consumer boycott in all contexts; preserve the category exactly.',
   true,1,90,'none'),
  ('C16','company','authoritative-list','current-list-membership',
   'The company/brand appears in the captured applicable BDS divestment/exclusion guidance or priority list.',
   'Do not relabel a consumer/organic/pressure target as a divestment target without the applicable official source.',
   true,1,90,'none'),
  ('C17','company','contract-or-supply','current-relationship',
   'Reliable records establish a direct military/security contracting relationship supplying relevant goods or services to Israel or the Israeli military.',
   'Merely operating in Israel or selling general consumer products does not establish contractor status.',
   true,1,180,'none'),
  ('C18','company','contract-or-supply','current-relationship',
   'Reliable records establish an Israeli government contract materially connected to military, policing, surveillance, detention, occupation, or related security activity.',
   'An unrelated civilian government contract does not qualify.',
   true,1,180,'none'),
  ('C19','company','financial-relationship','current-relationship',
   'Reliable holdings/filing data establish investment exposure meeting the project''s separately published materiality threshold to companies supplying the Israeli military.',
   'Do not qualify until a numeric materiality methodology is published; tiny index exposure or stale holdings data must not be treated as equivalent to a strategic investment.',
   true,1,90,'none'),
  ('C20','company','financial-relationship','current-relationship',
   'Reliable financing/filing data establish lending, underwriting, or comparable financial support meeting the project''s separately published materiality methodology to companies supplying the Israeli military.',
   'Ordinary payment processing or immaterial/stale exposure does not qualify without meeting the published methodology.',
   true,1,90,'none'),
  ('C21','company','organizational-policy','historical-event',
   'An official company communication explicitly supported Israeli military action or operations affecting Gaza or Palestinians.',
   'Personal statements by employees/executives do not qualify as company statements unless officially adopted/published by the company.',
   true,1,NULL,'none'),
  ('C22','company','leadership-attribution','historical-event',
   'A qualifying senior leader made an attributable personal statement explicitly supporting Israeli military action; the public presentation must identify this as leadership conduct, not an official company statement.',
   'Do not infer company endorsement, do not apply from non-senior employees, and do not rewrite the leader''s personal statement as corporate policy.',
   false,1,NULL,'relationship-context-only'),
  ('C23','company','documented-action','historical-event',
   'Reliable records document company provision of wartime material goods, services, facilities, or operational support to the Israeli state or military not captured by a narrower company reason.',
   'Use only when no narrower supply/contract/donation code accurately applies.',
   true,1,NULL,'none'),
  ('C24','company','other','current-relationship',
   'Reviewed, source-backed involvement in Israeli settlement activity exists but no narrower settlement reason accurately describes it.',
   'Do not use as a convenience code; reviewer must state why C09-C13 do not apply.',
   true,1,365,'none'),
  ('C25','company','authoritative-list','current-list-membership',
   'The company/brand appears in the captured current BDS guide as an organic boycott target.',
   'Preserve BDS''s distinction: this is a grassroots boycott campaign BDS supports, not a campaign BDS initiated and not automatically a consumer priority target.',
   true,1,90,'none')
ON CONFLICT (reason_code) DO UPDATE SET
  subject_scope = EXCLUDED.subject_scope,
  evidence_mode = EXCLUDED.evidence_mode,
  validity_mode = EXCLUDED.validity_mode,
  public_criteria = EXCLUDED.public_criteria,
  exclusion_criteria = EXCLUDED.exclusion_criteria,
  primary_or_authoritative_required = EXCLUDED.primary_or_authoritative_required,
  minimum_evidence_items = EXCLUDED.minimum_evidence_items,
  reverify_after_days = EXCLUDED.reverify_after_days,
  inheritance_policy = EXCLUDED.inheritance_policy,
  updated_at = now();

COMMIT;
