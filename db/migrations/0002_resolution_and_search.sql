BEGIN;

CREATE VIEW entity_resolution AS
WITH RECURSIVE chain AS (
  SELECT
    e.id AS requested_entity_id,
    e.id AS resolved_entity_id,
    e.merged_into_entity_id AS next_entity_id,
    ARRAY[e.id]::uuid[] AS path
  FROM entities e

  UNION ALL

  SELECT
    chain.requested_entity_id,
    target.id AS resolved_entity_id,
    target.merged_into_entity_id AS next_entity_id,
    chain.path || target.id
  FROM chain
  JOIN entities target ON target.id = chain.next_entity_id
  WHERE NOT target.id = ANY(chain.path)
)
SELECT requested_entity_id, resolved_entity_id
FROM chain
WHERE next_entity_id IS NULL;

COMMENT ON VIEW entity_resolution IS
  'Maps every entity, including historical merged entities, to the terminal canonical entity. Cyclic merge chains intentionally resolve to no row.';

DROP INDEX IF EXISTS entities_name_fts_idx;
DROP INDEX IF EXISTS entity_names_normalized_idx;

-- Trigram indexes only accelerate substring search; queries do not depend on
-- pg_trgm. cPanel's PostgreSQL 10 ships no contrib extensions and does not let
-- the database owner create them, so build these indexes only where possible.
DO $trgm$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX entities_canonical_name_trgm_idx
    ON entities USING gin (canonical_name gin_trgm_ops);
  CREATE INDEX entity_names_name_trgm_idx
    ON entity_names USING gin (name gin_trgm_ops);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable (%); substring search runs without trigram indexes', SQLERRM;
END
$trgm$;

CREATE INDEX entity_names_normalized_btree_idx
  ON entity_names(normalized_name);

COMMIT;
