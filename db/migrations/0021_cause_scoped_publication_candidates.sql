BEGIN;

DROP VIEW publication_candidates;

CREATE VIEW publication_candidates AS
SELECT
  cause.slug AS cause_slug,
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
JOIN causes cause
  ON cause.id = md.cause_id
 AND cause.active = true
JOIN entities e
  ON e.id = md.entity_id
 AND e.status = 'active'
JOIN membership_decision_reasons mdr
  ON mdr.decision_id = md.id
JOIN reason_causes rc
  ON rc.reason_code = mdr.reason_code
 AND rc.cause_id = md.cause_id
JOIN membership_reason_validation mrv
  ON mrv.decision_id = mdr.decision_id
 AND mrv.reason_code = mdr.reason_code
 AND mrv.assertion_id = mdr.assertion_id
 AND mrv.valid_for_publication = true
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
  cause.slug,
  CASE
    WHEN ik.publication_channel = 'domain' AND i.match_scope = 'include-subdomains'
      THEN 'domain-subdomains'
    ELSE ik.publication_channel
  END,
  md.list_kind,
  i.normalized_value,
  e.public_id;

COMMENT ON VIEW publication_candidates IS
  'Cause-scoped compiler projection. Extension payload entries remain identifier + public entity id + reason codes; cause is publication metadata.';

COMMIT;
