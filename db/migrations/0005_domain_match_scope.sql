BEGIN;

ALTER TABLE identifier_kinds
  DROP CONSTRAINT identifier_kinds_publication_channel_check;
ALTER TABLE identifier_kinds
  ADD CONSTRAINT identifier_kinds_publication_channel_check
  CHECK (
    publication_channel IS NULL OR
    publication_channel IN ('x', 'tiktok', 'instagram', 'youtube', 'domain', 'domain-subdomains')
  );

ALTER TABLE publication_artifacts
  DROP CONSTRAINT publication_artifacts_channel_check;
ALTER TABLE publication_artifacts
  ADD CONSTRAINT publication_artifacts_channel_check
  CHECK (channel IN ('x', 'tiktok', 'instagram', 'youtube', 'domain', 'domain-subdomains'));

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
JOIN reason_definitions rd
  ON rd.code = mdr.reason_code
 AND rd.active = true
JOIN assertions a
  ON a.id = mdr.assertion_id
 AND a.state = 'published'
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
  'Compiler projection only. Exact domains use channel domain; include-subdomains identifiers use domain-subdomains.';

COMMIT;
