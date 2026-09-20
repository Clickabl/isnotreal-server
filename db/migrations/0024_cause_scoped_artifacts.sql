BEGIN;

ALTER TABLE publication_artifacts
  ADD COLUMN cause_slug text NOT NULL DEFAULT 'israel-palestine'
  REFERENCES causes(slug);

DO $
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'publication_artifacts'::regclass
    AND contype = 'u'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE publication_artifacts DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$;

DROP INDEX publication_artifacts_full_uq;
DROP INDEX publication_artifacts_delta_uq;

CREATE UNIQUE INDEX publication_artifacts_full_uq
  ON publication_artifacts(publication_id, cause_slug, channel, list_kind, version)
  WHERE artifact_kind = 'full';

CREATE UNIQUE INDEX publication_artifacts_delta_uq
  ON publication_artifacts(publication_id, cause_slug, channel, list_kind, version, base_version)
  WHERE artifact_kind = 'delta';

CREATE INDEX publication_artifacts_cause_lookup_idx
  ON publication_artifacts(cause_slug, channel, list_kind, artifact_kind, version);

COMMIT;
