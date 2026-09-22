BEGIN;

INSERT INTO source_documents (canonical_url, title, publisher, source_type) VALUES
  ('https://www.justice.gov/epstein', 'Department of Justice Epstein Library', 'U.S. Department of Justice', 'primary'),
  ('https://ofac.treasury.gov/sanctions-list-service', 'OFAC Sanctions List Service', 'U.S. Department of the Treasury', 'primary')
ON CONFLICT (canonical_url) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  source_type = EXCLUDED.source_type,
  updated_at = now();

INSERT INTO reason_definitions (code, label, description, category, default_list) VALUES
  ('E01','Mentioned in an official Epstein-related released record','The entity is explicitly named in a released government or court record in the Epstein-related document corpus. A mention alone is not an allegation or finding of wrongdoing.','epstein-record','highlight'),
  ('E02','Documented direct contact in an Epstein-related released record','A released primary record documents direct contact, communication, travel, meeting, transaction, or another specifically described interaction with Jeffrey Epstein or Ghislaine Maxwell.','epstein-record','highlight'),
  ('E03','Named in a sourced allegation in an Epstein-related record','A released complaint, sworn statement, filing, or other attributable source contains a specific allegation involving the entity. This records the allegation, not its truth.','epstein-record','highlight'),
  ('E04','Adjudicated Epstein/Maxwell-related finding or conviction','A court judgment or official disposition establishes a criminal conviction or civil finding specifically related to Epstein/Maxwell conduct.','epstein-record','highlight'),
  ('M01','Public endorsement of Donald Trump or a MAGA campaign','The entity made an attributable public endorsement of Donald Trump or a campaign explicitly identifying itself with MAGA.','public-political-activity','highlight'),
  ('M02','Formal Trump/MAGA campaign or administration role','The person held a documented formal campaign, transition, administration, or official organizational role for Donald Trump or a MAGA-branded campaign.','public-political-activity','highlight'),
  ('M03','Explicit public self-identification with MAGA','The person or organization explicitly and publicly identified itself with MAGA in its own attributable statement or official material.','public-political-activity','highlight'),
  ('M04','Official Trump/MAGA campaign event participation','The entity was officially listed as a speaker, host, performer, organizer, or featured participant at a Trump or MAGA campaign event.','public-political-activity','highlight'),
  ('R01','Current OFAC Russia-related sanctions designation','The entity currently appears on an official OFAC sanctions list with a Russia-related program designation.','russia-ukraine','highlight'),
  ('R02','Documented Russian state ownership or control','Primary or authoritative evidence documents current ownership or control by the Russian state or a Russian state-controlled entity.','russia-ukraine','highlight'),
  ('R03','Documented current business operations in Russia','Current primary or high-quality evidence documents material ongoing business operations in Russia.','russia-ukraine','highlight'),
  ('R04','Documented military or defense supply to the Russian state','Primary or authoritative evidence documents a current contract or supply relationship providing military or defense goods/services to the Russian state or armed forces.','russia-ukraine','highlight'),
  ('R05','Attributable public support for Russia’s invasion of Ukraine','The person or organization made a specific attributable public statement supporting Russia’s invasion or military campaign in Ukraine.','russia-ukraine','highlight'),
  ('R06','Attributable public support or humanitarian aid for Ukraine','The person or organization made a specific attributable public statement supporting Ukraine or documented humanitarian aid for Ukraine.','russia-ukraine','highlight')
ON CONFLICT (code) DO NOTHING;

INSERT INTO reason_evidence_requirements (
  reason_code, subject_scope, evidence_mode, validity_mode, public_criteria, exclusion_criteria,
  primary_or_authoritative_required, minimum_evidence_items, reverify_after_days, inheritance_policy
) VALUES
  ('E01','person','other','historical-event',
   'An official government/court release must name the same verified entity and the public record must link to the exact document or locator.',
   'Do not publish victims, minors, private individuals, redacted identities, mere name collisions, or a claim of wrongdoing inferred only from a mention.',
   true,1,NULL,'none'),
  ('E02','any','documented-action','historical-event',
   'A primary released record must document a specific interaction and identify the same entity.',
   'A name in an index, address book, mass distribution, or unrelated third-party reference does not by itself establish direct contact.',
   true,1,NULL,'none'),
  ('E03','person','other','historical-event',
   'The source must contain a specific attributable allegation and the public summary must label it as an allegation rather than a finding.',
   'Rumor, anonymous social posts, unsourced compilations, and a bare document mention do not qualify.',
   true,1,NULL,'none'),
  ('E04','person','other','historical-event',
   'A court judgment, conviction record, plea, or official disposition must establish the specific finding.',
   'Charges, allegations, investigations, document mentions, and dismissed claims are not adjudicated findings.',
   true,1,NULL,'none'),
  ('M01','any','public-statement','historical-event',
   'Use the entity’s attributable statement or an official campaign record of the endorsement.',
   'Do not infer endorsement from party registration, family/employer association, attendance alone, or third-party characterization.',
   true,1,NULL,'none'),
  ('M02','person','documented-action','historical-event',
   'Use an official appointment, campaign staff listing, government record, or equivalent primary documentation of the role.',
   'Informal support, media appearances, family relationships, and employment outside the campaign/administration do not qualify.',
   true,1,NULL,'none'),
  ('M03','any','public-statement','current-status',
   'Use the entity’s own attributable statement or official material explicitly identifying with MAGA.',
   'Do not infer ideology from policy positions, party affiliation, endorsements, audience, geography, or associates.',
   true,1,365,'none'),
  ('M04','any','documented-action','historical-event',
   'Use an official campaign/event listing identifying the entity as a featured participant, speaker, host, performer, or organizer.',
   'Ordinary attendance, media coverage, venue employment, or an event mention without participation does not qualify.',
   true,1,NULL,'none'),
  ('R01','any','authoritative-list','current-list-membership',
   'The same verified entity must appear on an official OFAC list with a Russia-related sanctions program tag.',
   'Nationality, residence, Russian business activity, a similarly named entity, or a non-Russia sanctions program does not qualify.',
   true,1,14,'none'),
  ('R02','company','organizational-policy','current-status',
   'Primary corporate/government records or authoritative filings must document current Russian state ownership or control.',
   'Russian customers, employees, founders, minority investors, nationality, or historical ownership alone do not qualify.',
   true,1,180,'none'),
  ('R03','company','documented-action','current-status',
   'Current filings, company disclosures, or high-quality reporting must document material ongoing operations in Russia.',
   'Historical operations, a passive website, unauthorized resale, or isolated third-party distribution does not qualify.',
   false,2,90,'none'),
  ('R04','company','contract-or-supply','current-status',
   'A contract, procurement record, company disclosure, sanctions/enforcement record, or equivalent authoritative evidence must document current military/defense supply.',
   'Civilian sales, unverified allegations, or indirect ownership without a documented supply relationship do not qualify.',
   true,1,180,'none'),
  ('R05','any','public-statement','historical-event',
   'Use the entity’s attributable statement that specifically supports Russia’s invasion or military campaign in Ukraine.',
   'Russian nationality, criticism of Ukraine/NATO, calls for negotiation, or third-party ideological labels do not by themselves qualify.',
   true,1,NULL,'none'),
  ('R06','any','public-statement','historical-event',
   'Use an attributable public statement or documented aid action specifically supporting Ukraine or humanitarian relief for Ukraine.',
   'General anti-war statements or unrelated charitable activity do not qualify without Ukraine-specific evidence.',
   true,1,NULL,'none')
ON CONFLICT (reason_code) DO NOTHING;

INSERT INTO reason_causes (reason_code, cause_id)
SELECT code, cause.id
FROM reason_definitions
JOIN causes cause ON cause.slug = CASE
  WHEN code LIKE 'E%' THEN 'epstein-records'
  WHEN code LIKE 'M%' THEN 'trump-maga'
  WHEN code LIKE 'R%' THEN 'russia-ukraine'
END
WHERE code IN ('E01','E02','E03','E04','M01','M02','M03','M04','R01','R02','R03','R04','R05','R06')
ON CONFLICT DO NOTHING;

INSERT INTO cause_reason_preferences (
  cause_id, reason_code, suggested_action, user_selectable, sort_order
)
SELECT rc.cause_id, rc.reason_code, 'informational', true,
       row_number() OVER (PARTITION BY rc.cause_id ORDER BY rc.reason_code) * 10
FROM reason_causes rc
WHERE rc.reason_code IN ('E01','E02','E03','E04','M01','M02','M03','M04','R01','R02','R03','R04','R05','R06')
ON CONFLICT (cause_id, reason_code) DO UPDATE SET
  suggested_action = 'informational',
  user_selectable = true;

INSERT INTO reason_authority_sources (reason_code, source_document_id, authority_role)
SELECT reason.code, document.id, 'official-guidance'
FROM reason_definitions reason
JOIN source_documents document ON document.canonical_url = 'https://www.justice.gov/epstein'
WHERE reason.code IN ('E01','E02','E03','E04')
ON CONFLICT DO NOTHING;

INSERT INTO reason_authority_sources (reason_code, source_document_id, authority_role)
SELECT 'R01', document.id, 'authoritative-list'
FROM source_documents document
WHERE document.canonical_url = 'https://ofac.treasury.gov/sanctions-list-service'
ON CONFLICT DO NOTHING;

UPDATE reason_catalog_versions SET state = 'retired' WHERE state = 'active';

INSERT INTO reason_catalog_versions (version, state, notes, published_at)
SELECT COALESCE(max(version), 0) + 1,
       'active',
       'Adds factual Epstein-record, Trump/MAGA public-activity, and Russia/Ukraine reason vocabulary. Presentation defaults to informational/highlight; users choose local filter treatment.',
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
  CASE WHEN reason.code IN ('C19','C20') THEN false ELSE true END,
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
