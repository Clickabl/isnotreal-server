BEGIN;

INSERT INTO reason_definitions (code, label, description, category, default_list, publication_enabled)
VALUES
  ('EP01', 'Named in released Epstein-related record', 'The entity is explicitly named in a released Epstein-related record with an exact source and document locator. A mention alone is not an allegation or finding of wrongdoing.', 'epstein-record', 'highlight', true),
  ('EP02', 'Documented direct contact with Epstein or Maxwell', 'A released primary record documents direct communication, a meeting, appointment, address-book/contact entry, or comparable direct contact with Jeffrey Epstein or Ghislaine Maxwell. The record does not by itself establish misconduct.', 'epstein-record', 'highlight', true),
  ('EP03', 'Documented Epstein aircraft travel', 'A released primary flight or travel record identifies the person as a passenger or traveler connected to an Epstein aircraft. Travel alone does not establish misconduct.', 'epstein-record', 'highlight', true),
  ('EP04', 'Attributed allegation in released Epstein-related record', 'A released record contains a specific allegation about the entity, attributed to the person or proceeding that made it. This records the existence of the allegation, not that it is true.', 'epstein-record', 'highlight', true),
  ('EP05', 'Epstein-related charge, conviction, or adjudicated finding', 'An official court or government record documents a charge, conviction, civil finding, or other adjudicated outcome connected to Epstein-related conduct, with the procedural status stated precisely.', 'epstein-record', 'highlight', true),
  ('MAGA01', 'Public endorsement of Donald Trump', 'The person explicitly and publicly endorsed Donald Trump for president or another election, in an attributable statement or official endorsement record.', 'trump-maga', 'highlight', true),
  ('MAGA02', 'Official Trump campaign role', 'The person held a documented official role in a Donald Trump presidential campaign or an official campaign coalition.', 'trump-maga', 'highlight', true),
  ('MAGA03', 'Explicit MAGA / America First self-identification', 'The person explicitly described their own political identity or advocacy as MAGA, Make America Great Again, or America First in an attributable source.', 'trump-maga', 'highlight', true),
  ('MAGA04', 'Official Trump campaign event participant', 'The person was identified by the campaign as an official speaker, surrogate, tour participant, or featured campaign-event participant.', 'trump-maga', 'highlight', true),
  ('RU01', 'Russia-related sanctions designation', 'The entity is currently designated on an official sanctions list under a Russia-related program. The exact authority and program tag must be retained.', 'russia-ukraine', 'highlight', true),
  ('RU02', 'Documented Russian state ownership or control', 'Current primary or authoritative records document material ownership or control by the Russian state or a Russian state-controlled entity.', 'russia-ukraine', 'highlight', true),
  ('RU03', 'Documented continuing business operations in Russia', 'Current company disclosures or equivalent authoritative evidence document continuing material business operations in Russia.', 'russia-ukraine', 'highlight', true),
  ('RU04', 'Documented supply or contract supporting Russian military activity', 'Primary or authoritative evidence documents a material contract, supply relationship, or service supporting Russian military or defense activity.', 'russia-ukraine', 'highlight', true),
  ('RU05', 'Explicit public support for Russia’s invasion or military action in Ukraine', 'The person or organization explicitly supported Russia’s invasion of Ukraine or Russian military action in an attributable public statement.', 'russia-ukraine', 'highlight', true),
  ('RU06', 'Documented exit or suspension of Russia operations', 'Current company disclosures or equivalent authoritative evidence document an exit from or material suspension of business operations in Russia.', 'russia-ukraine', 'highlight', true),
  ('RU07', 'Documented support for Ukraine', 'Primary or authoritative evidence documents material humanitarian, reconstruction, defensive, or other support provided to Ukraine.', 'russia-ukraine', 'highlight', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO reason_evidence_requirements (
  reason_code, subject_scope, evidence_mode, validity_mode, public_criteria,
  exclusion_criteria, primary_or_authoritative_required, minimum_evidence_items,
  reverify_after_days, inheritance_policy
)
VALUES
  ('EP01','any','documented-action','historical-event',
   'An exact released record names the entity and the evidence stores the specific file plus page, image, timestamp, row, or equivalent locator needed to verify the mention.',
   'Do not qualify ambiguous name matches, OCR-only matches that cannot be visually verified, victims/minors/private individuals whose inclusion would expose sensitive personal information, or a name appearing only in unsourced commentary. A mention must never be described as wrongdoing.',
   true,1,NULL,'none'),
  ('EP02','person','documented-action','historical-event',
   'A released primary record directly documents communication, a meeting/appointment, contact-book entry, or comparable direct contact with Epstein or Maxwell.',
   'Do not infer direct contact from appearing in the same document, event, organization, social circle, photograph, or another person’s contact entry without attribution.',
   true,1,NULL,'none'),
  ('EP03','person','documented-action','historical-event',
   'A released primary flight/travel record identifies the person as a passenger or traveler and the exact record locator is retained.',
   'Do not infer passenger status from ownership, destination, social association, a similar name, or secondary lists that cannot be reconciled to the primary record.',
   true,1,NULL,'none'),
  ('EP04','any','documented-action','historical-event',
   'A released record contains a specific allegation naming the entity; the assertion must identify who made the allegation and preserve its procedural/contextual status.',
   'Do not convert an allegation into a factual finding, omit exculpatory/procedural context, or publish allegations about protected victims/minors/private people without heightened review.',
   true,1,NULL,'none'),
  ('EP05','any','documented-action','historical-event',
   'An official court or government record documents the exact charge, conviction, civil finding, disposition, or adjudicated outcome and its current procedural status.',
   'Do not treat an arrest, accusation, dismissed count, acquittal, settlement without admission, conviction, and final judgment as interchangeable.',
   true,1,NULL,'none'),
  ('MAGA01','person','public-statement','historical-event',
   'An attributable direct statement or official campaign endorsement record explicitly identifies the person as endorsing Donald Trump.',
   'Do not infer endorsement from party registration, attendance alone, family relationships, employment, follows/likes, or generalized conservative views.',
   true,1,NULL,'none'),
  ('MAGA02','person','documented-action','historical-event',
   'An official campaign record or equivalent primary evidence identifies the person in an official Trump campaign or campaign-coalition role.',
   'Do not infer a campaign role from ordinary administration employment, party membership, media appearances, donations, or ideological similarity.',
   true,1,NULL,'none'),
  ('MAGA03','person','public-statement','historical-event',
   'An attributable statement explicitly uses MAGA, Make America Great Again, or America First as the person’s own political identity or advocacy.',
   'Do not infer this identity from policy positions, Republican affiliation, third-party labels, hashtags posted by others, or attendance alone.',
   true,1,NULL,'none'),
  ('MAGA04','person','documented-action','historical-event',
   'An official campaign record identifies the person as a speaker, surrogate, tour participant, or featured participant at a Trump campaign event.',
   'Do not qualify ordinary attendees, venue employees, journalists, protesters, or people merely photographed near an event.',
   true,1,NULL,'none'),
  ('RU01','any','authoritative-list','current-list-membership',
   'The entity is currently present on an official sanctions list under a Russia-related program and the program/designation tag is stored.',
   'Do not infer a Russia-related designation from nationality, a non-Russia sanctions program, media descriptions, or a similarly named entity.',
   true,1,7,'none'),
  ('RU02','company','financial-relationship','current-relationship',
   'Current primary filings, ownership records, or authoritative government records establish material Russian state ownership or control.',
   'Do not infer state control from Russian nationality, historical ownership that has ended, minority holdings without control, or an executive’s nationality.',
   true,1,90,'none'),
  ('RU03','company','documented-action','current-status',
   'Current company disclosures, filings, or equivalent authoritative evidence establish continuing material business operations in Russia.',
   'Do not qualify solely from historical operations, inaccessible legacy webpages, independent franchisees without attribution, or goods reaching Russia through unauthorized resale.',
   true,1,90,'none'),
  ('RU04','company','contract-or-supply','current-relationship',
   'Primary contract/supply records or authoritative government evidence establish a material relationship supporting Russian military or defense activity.',
   'Do not infer military support from civilian Russian business, nationality, generic dual-use capability, or unsupported allegations.',
   true,1,90,'none'),
  ('RU05','any','public-statement','historical-event',
   'An attributable public statement explicitly supports Russia’s invasion of Ukraine or Russian military action in Ukraine.',
   'Do not infer support from nationality, calls for negotiations/ceasefire, criticism of Ukraine/NATO, neutral reporting, or third-party characterization.',
   true,1,NULL,'none'),
  ('RU06','company','documented-action','current-status',
   'Current company disclosures or equivalent authoritative evidence document an exit from or material suspension of Russia operations.',
   'Do not qualify from an announced intention that was not implemented or a partial change described as a complete exit.',
   true,1,180,'none'),
  ('RU07','any','documented-action','historical-event',
   'Primary or authoritative evidence documents material humanitarian, reconstruction, defensive, or other support provided to Ukraine.',
   'Do not infer support from statements alone when the asserted reason is material aid; describe public statements under a separate factual reason if added.',
   true,1,NULL,'none')
ON CONFLICT (reason_code) DO NOTHING;

INSERT INTO source_documents (canonical_url, title, publisher, source_type, first_published_at)
VALUES
  ('https://www.justice.gov/epstein', 'Epstein Library', 'United States Department of Justice', 'primary', NULL),
  ('https://www.donaldjtrump.com/news/news-yx8fwpugn60', 'Donald J. Trump campaign news archive', 'Donald J. Trump for President', 'campaign', NULL),
  ('https://ofac.treasury.gov/sanctions-programs-and-country-information/russia-related-sanctions', 'Russia-related Sanctions Programs', 'U.S. Department of the Treasury, Office of Foreign Assets Control', 'primary', NULL),
  ('https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML', 'OFAC Specially Designated Nationals XML', 'U.S. Department of the Treasury, Office of Foreign Assets Control', 'primary', NULL)
ON CONFLICT (canonical_url) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  source_type = EXCLUDED.source_type,
  updated_at = now();

INSERT INTO reason_authority_sources (reason_code, source_document_id, authority_role)
SELECT 'RU01', source.id, 'authoritative-list'
FROM source_documents source
WHERE source.canonical_url = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML'
ON CONFLICT DO NOTHING;

INSERT INTO reason_causes (reason_code, cause_id)
SELECT reason.code, cause.id
FROM (
  VALUES
    ('EP01','epstein-records'),('EP02','epstein-records'),('EP03','epstein-records'),
    ('EP04','epstein-records'),('EP05','epstein-records'),
    ('MAGA01','trump-maga'),('MAGA02','trump-maga'),('MAGA03','trump-maga'),('MAGA04','trump-maga'),
    ('RU01','russia-ukraine'),('RU02','russia-ukraine'),('RU03','russia-ukraine'),
    ('RU04','russia-ukraine'),('RU05','russia-ukraine'),('RU06','russia-ukraine'),('RU07','russia-ukraine')
) AS reason(code, cause_slug)
JOIN causes cause ON cause.slug = reason.cause_slug
ON CONFLICT DO NOTHING;

INSERT INTO cause_reason_preferences (
  cause_id, reason_code, suggested_action, user_selectable, sort_order
)
SELECT cause.id, seed.reason_code, seed.action, true, seed.sort_order
FROM (
  VALUES
    ('epstein-records','EP01','informational',10),('epstein-records','EP02','informational',20),
    ('epstein-records','EP03','informational',30),('epstein-records','EP04','informational',40),
    ('epstein-records','EP05','informational',50),
    ('trump-maga','MAGA01','informational',10),('trump-maga','MAGA02','informational',20),
    ('trump-maga','MAGA03','informational',30),('trump-maga','MAGA04','informational',40),
    ('russia-ukraine','RU01','informational',10),('russia-ukraine','RU02','informational',20),
    ('russia-ukraine','RU03','informational',30),('russia-ukraine','RU04','informational',40),
    ('russia-ukraine','RU05','informational',50),('russia-ukraine','RU06','informational',60),
    ('russia-ukraine','RU07','informational',70)
) AS seed(cause_slug, reason_code, action, sort_order)
JOIN causes cause ON cause.slug = seed.cause_slug
ON CONFLICT (cause_id, reason_code) DO UPDATE SET
  suggested_action = EXCLUDED.suggested_action,
  user_selectable = EXCLUDED.user_selectable,
  sort_order = EXCLUDED.sort_order;

-- Publish a new immutable reason-catalog snapshot so these reasons are immediately
-- usable by validation/publication after the migration.
UPDATE reason_catalog_versions SET state = 'retired' WHERE state = 'active';

INSERT INTO reason_catalog_versions (version, state, notes, published_at)
SELECT COALESCE(max(version), 0) + 1,
       'active',
       'Adds factual Epstein-record, Trump/MAGA public-activity, and Russia/Ukraine reason vocabulary. User-selectable presentation remains informational by default.',
       now()
FROM reason_catalog_versions;

INSERT INTO reason_catalog_entries (
  catalog_version_id, reason_code, label, description, category, default_list,
  publication_enabled, subject_scope, evidence_mode, validity_mode, public_criteria,
  exclusion_criteria, primary_or_authoritative_required, minimum_evidence_items,
  reverify_after_days, inheritance_policy, campaigns, authority_sources
)
SELECT
  version.id,
  reason.code,
  reason.label,
  reason.description,
  reason.category,
  reason.default_list,
  reason.publication_enabled,
  requirement.subject_scope,
  requirement.evidence_mode,
  requirement.validity_mode,
  requirement.public_criteria,
  requirement.exclusion_criteria,
  requirement.primary_or_authoritative_required,
  requirement.minimum_evidence_items,
  requirement.reverify_after_days,
  requirement.inheritance_policy,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'slug', campaign.slug,
      'name', campaign.name,
      'membershipRole', binding.membership_role,
      'assertionActionType', binding.assertion_action_type
    ) ORDER BY campaign.slug)
    FROM reason_campaign_bindings binding
    JOIN campaigns campaign ON campaign.id = binding.campaign_id
    WHERE binding.reason_code = reason.code
  ), '[]'::jsonb),
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'url', document.canonical_url,
      'title', document.title,
      'publisher', document.publisher,
      'role', authority.authority_role
    ) ORDER BY authority.authority_role, document.canonical_url)
    FROM reason_authority_sources authority
    JOIN source_documents document ON document.id = authority.source_document_id
    WHERE authority.reason_code = reason.code
  ), '[]'::jsonb)
FROM reason_catalog_versions version
CROSS JOIN reason_definitions reason
LEFT JOIN reason_evidence_requirements requirement ON requirement.reason_code = reason.code
WHERE version.state = 'active' AND reason.active = true;

COMMIT;
