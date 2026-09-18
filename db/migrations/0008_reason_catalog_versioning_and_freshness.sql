BEGIN;

ALTER TABLE membership_decision_reasons
  ADD COLUMN last_verified_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE membership_decision_reasons
  ADD COLUMN verification_review_event_id uuid NULL REFERENCES review_events(id);

CREATE INDEX membership_decision_reasons_verification_idx
  ON membership_decision_reasons(reason_code, last_verified_at);

CREATE TABLE reason_catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('draft', 'active', 'retired')),
  notes text NOT NULL DEFAULT '',
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX reason_catalog_versions_one_active_uq
  ON reason_catalog_versions((true))
  WHERE state = 'active';

CREATE TABLE reason_catalog_entries (
  catalog_version_id uuid NOT NULL REFERENCES reason_catalog_versions(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  label text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  default_list text NOT NULL CHECK (default_list IN ('filter', 'highlight', 'none')),
  subject_scope text NULL,
  evidence_mode text NULL,
  validity_mode text NULL,
  public_criteria text NULL,
  exclusion_criteria text NULL,
  primary_or_authoritative_required boolean NULL,
  minimum_evidence_items smallint NULL,
  reverify_after_days integer NULL,
  inheritance_policy text NULL,
  PRIMARY KEY (catalog_version_id, reason_code)
);

INSERT INTO reason_catalog_versions (version, state, notes, published_at)
VALUES (
  1,
  'active',
  'Initial official reason catalog. Stable factual-action codes with explicit evidence qualification rules.',
  now()
);

INSERT INTO reason_catalog_entries (
  catalog_version_id,
  reason_code,
  label,
  description,
  category,
  default_list,
  subject_scope,
  evidence_mode,
  validity_mode,
  public_criteria,
  exclusion_criteria,
  primary_or_authoritative_required,
  minimum_evidence_items,
  reverify_after_days,
  inheritance_policy
)
SELECT
  rcv.id,
  rd.code,
  rd.label,
  rd.description,
  rd.category,
  rd.default_list,
  req.subject_scope,
  req.evidence_mode,
  req.validity_mode,
  req.public_criteria,
  req.exclusion_criteria,
  req.primary_or_authoritative_required,
  req.minimum_evidence_items,
  req.reverify_after_days,
  req.inheritance_policy
FROM reason_catalog_versions rcv
CROSS JOIN reason_definitions rd
LEFT JOIN reason_evidence_requirements req ON req.reason_code = rd.code
WHERE rcv.version = 1
  AND rd.active = true;

CREATE VIEW current_reason_catalog AS
SELECT
  rcv.version AS catalog_version,
  rce.reason_code AS code,
  rce.label,
  rce.description,
  rce.category,
  rce.default_list,
  rce.subject_scope,
  rce.evidence_mode,
  rce.validity_mode,
  rce.public_criteria,
  rce.exclusion_criteria,
  rce.primary_or_authoritative_required,
  rce.minimum_evidence_items,
  rce.reverify_after_days,
  rce.inheritance_policy
FROM reason_catalog_versions rcv
JOIN reason_catalog_entries rce ON rce.catalog_version_id = rcv.id
WHERE rcv.state = 'active';

COMMENT ON VIEW current_reason_catalog IS
  'Immutable snapshot of the currently active public reason taxonomy. Publish a new catalog version rather than mutating old public definitions.';

CREATE OR REPLACE VIEW publication_candidates AS
SELECT
  CASE
    WHEN ik.publication_channel = 'domain' AND i.match_scope = 'include-subdomains'
      THEN 'domain-subdomains'
    ELSE ik.publication_channel
  END AS channel,
  md.list_kind,
  i.normalized_value AS identifier,
  e.public_id::text AS entity_public_id,
  array_agg(DISTINCT mdr.reason_code ORDER BY mdr.reason_code) AS reason_codes
FROM membership_decisions md
JOIN entities e
  ON e.id = md.entity_id
 AND e.status = 'active'
JOIN membership_decision_reasons mdr
  ON mdr.decision_id = md.id
JOIN current_reason_catalog crc
  ON crc.code = mdr.reason_code
JOIN assertions a
  ON a.id = mdr.assertion_id
 AND a.state = 'published'
LEFT JOIN reason_evidence_requirements req
  ON req.reason_code = mdr.reason_code
JOIN identifier_assignments ia
  ON ia.entity_id = e.id
 AND ia.state = 'verified'
 AND ia.valid_to IS NULL
JOIN identifiers i
  ON i.id = ia.identifier_id
 AND i.status = 'active'
JOIN identifier_kinds ik
  ON ik.code = i.kind_code
 AND ik.publication_channel IS NOT NULL
WHERE md.state = 'active'
  AND md.decision = 'include'
  AND (
    req.reverify_after_days IS NULL
    OR mdr.last_verified_at >= now() - make_interval(days => req.reverify_after_days)
  )
GROUP BY
  CASE
    WHEN ik.publication_channel = 'domain' AND i.match_scope = 'include-subdomains'
      THEN 'domain-subdomains'
    ELSE ik.publication_channel
  END,
  md.list_kind,
  i.normalized_value,
  e.public_id;

COMMENT ON VIEW publication_candidates IS
  'Compiler projection only. Current-status reasons are omitted when their last verification is older than the reason catalog re-verification window; historical evidence remains in the canonical database.';

COMMIT;
