BEGIN;

ALTER TABLE publication_artifacts
  ADD COLUMN cause_slug text NOT NULL DEFAULT 'israel-palestine'
  REFERENCES causes(slug);

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'publication_artifacts'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE publication_artifacts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

DROP INDEX IF EXISTS publication_artifacts_identity_uq;
DROP INDEX IF EXISTS publication_artifacts_full_uq;
DROP INDEX IF EXISTS publication_artifacts_delta_uq;

CREATE UNIQUE INDEX publication_artifacts_identity_uq
  ON publication_artifacts(publication_id, cause_slug, channel, list_kind, artifact_kind, version, COALESCE(base_version, ''));

CREATE INDEX publication_artifacts_cause_lookup_idx
  ON publication_artifacts(cause_slug, channel, list_kind, artifact_kind, version);

COMMIT;
