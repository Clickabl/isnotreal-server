BEGIN;

ALTER TABLE entity_relationships
  DROP CONSTRAINT entity_relationships_relationship_type_check;

ALTER TABLE entity_relationships
  ADD CONSTRAINT entity_relationships_relationship_type_check
  CHECK (
    relationship_type IN (
      'owns',
      'controls',
      'brand-of',
      'member-of',
      'licenses',
      'operates',
      'executive-of'
    )
  );

CREATE VIEW membership_reason_validation AS
WITH checks AS (
  SELECT
    mdr.decision_id,
    mdr.reason_code,
    mdr.assertion_id,
    md.entity_id,
    e.kind AS entity_kind,
    a.primary_entity_id AS assertion_primary_entity_id,
    crc.subject_scope,
    crc.evidence_mode,
    crc.validity_mode,
    crc.primary_or_authoritative_required,
    crc.minimum_evidence_items,
    crc.reverify_after_days,
    crc.inheritance_policy,
    mdr.last_verified_at,
    a.state AS assertion_state,
    COALESCE(ev.source_count, 0) AS source_count,
    COALESCE(ev.primary_source_count, 0) AS primary_source_count,
    COALESCE(ev.authority_source_count, 0) AS authority_source_count,
    CASE
      WHEN crc.subject_scope = 'person'
        THEN e.kind IN ('person', 'music-group')
      WHEN crc.subject_scope = 'company'
        THEN e.kind IN ('company', 'brand')
      WHEN crc.subject_scope = 'organization'
        THEN e.kind = 'organization'
      WHEN crc.subject_scope = 'any'
        THEN true
      ELSE false
    END AS subject_scope_valid,
    (
      a.primary_entity_id = md.entity_id
      OR EXISTS (
        SELECT 1
        FROM assertion_participants ap
        WHERE ap.assertion_id = a.id
          AND ap.entity_id = md.entity_id
      )
      OR (
        crc.inheritance_policy = 'relationship-context-only'
        AND a.primary_entity_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM entity_relationships rel
          WHERE rel.from_entity_id = a.primary_entity_id
            AND rel.to_entity_id = md.entity_id
            AND rel.relationship_type = 'executive-of'
            AND rel.status = 'verified'
            AND rel.valid_to IS NULL
        )
      )
    ) AS assertion_subject_valid,
    CASE
      WHEN crc.evidence_mode = 'named-campaign-membership' THEN EXISTS (
        SELECT 1
        FROM campaign_versions cv
        JOIN reason_campaign_bindings rcb
          ON rcb.campaign_id = cv.campaign_id
         AND rcb.reason_code = mdr.reason_code
        WHERE cv.id = a.campaign_version_id
      )
      ELSE true
    END AS campaign_binding_valid,
    CASE
      WHEN crc.evidence_mode IN ('named-campaign-membership', 'authoritative-list')
        THEN COALESCE(ev.authority_source_count, 0) > 0
      ELSE true
    END AS exact_authority_valid,
    (
      crc.reverify_after_days IS NULL
      OR mdr.last_verified_at >= now() - make_interval(days => crc.reverify_after_days)
    ) AS freshness_valid
  FROM membership_decision_reasons mdr
  JOIN membership_decisions md ON md.id = mdr.decision_id
  JOIN entities e ON e.id = md.entity_id
  JOIN assertions a ON a.id = mdr.assertion_id
  JOIN current_reason_catalog crc ON crc.code = mdr.reason_code
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT asl.capture_id)::integer AS source_count,
      count(DISTINCT asl.capture_id) FILTER (
        WHERE asl.is_primary = true
           OR sd.source_type IN ('primary', 'campaign', 'filing')
      )::integer AS primary_source_count,
      count(DISTINCT asl.capture_id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM reason_authority_sources ras
          WHERE ras.reason_code = mdr.reason_code
            AND ras.source_document_id = sd.id
        )
      )::integer AS authority_source_count
    FROM assertion_source_links asl
    JOIN source_captures sc
      ON sc.id = asl.capture_id
     AND sc.status = 'available'
    JOIN source_documents sd ON sd.id = sc.document_id
    WHERE asl.assertion_id = a.id
  ) ev ON true
)
SELECT
  decision_id,
  reason_code,
  assertion_id,
  entity_id,
  source_count,
  primary_source_count,
  authority_source_count,
  last_verified_at,
  (
    assertion_state = 'published'
    AND subject_scope_valid
    AND assertion_subject_valid
    AND campaign_binding_valid
    AND exact_authority_valid
    AND source_count >= minimum_evidence_items
    AND (
      primary_or_authoritative_required = false
      OR primary_source_count > 0
      OR authority_source_count > 0
    )
    AND freshness_valid
  ) AS valid_for_publication,
  array_remove(
    ARRAY[
      CASE WHEN assertion_state <> 'published' THEN 'assertion-not-published' END,
      CASE WHEN NOT subject_scope_valid THEN 'subject-scope-mismatch' END,
      CASE WHEN NOT assertion_subject_valid THEN 'assertion-not-attributed-to-entity' END,
      CASE WHEN NOT campaign_binding_valid THEN 'campaign-binding-mismatch' END,
      CASE WHEN NOT exact_authority_valid THEN 'missing-required-authority-source' END,
      CASE WHEN source_count < minimum_evidence_items THEN 'insufficient-sources' END,
      CASE
        WHEN primary_or_authoritative_required
         AND primary_source_count = 0
         AND authority_source_count = 0
          THEN 'missing-primary-or-authoritative-source'
      END,
      CASE WHEN NOT freshness_valid THEN 'verification-stale' END
    ]::text[],
    NULL
  ) AS issues
FROM checks;

COMMENT ON VIEW membership_reason_validation IS
  'Auditable gate between reviewed membership reasons and extension publications. A reason can remain in the canonical evidence history while failing current publication requirements.';

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
  CASE
    WHEN ik.publication_channel = 'domain' AND i.match_scope = 'include-subdomains'
      THEN 'domain-subdomains'
    ELSE ik.publication_channel
  END,
  md.list_kind,
  i.normalized_value,
  e.public_id;

COMMIT;
