from pathlib import Path

# Use distinct migration numbers rather than colliding with the parallel artifact migration.
p=Path('db/migrations/0024_import_cause_guard.sql')
if p.exists(): p.rename('db/migrations/0026_import_cause_guard.sql')
Path('db/migrations/0027_partition_publication_activation.sql').write_text(r'''BEGIN;

ALTER TABLE publications ADD COLUMN IF NOT EXISTS cause_id uuid REFERENCES causes(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT publication_id FROM publication_artifacts GROUP BY publication_id
    HAVING count(DISTINCT cause_slug) > 1
  ) THEN
    RAISE EXCEPTION 'Legacy multi-cause publication requires explicit archival before per-cause activation migration';
  END IF;
END $$;

UPDATE publications p SET cause_id = c.id FROM causes c
WHERE p.cause_id IS NULL AND c.slug = COALESCE(
  (SELECT min(a.cause_slug) FROM publication_artifacts a WHERE a.publication_id=p.id),
  'israel-palestine'
);
ALTER TABLE publications ALTER COLUMN cause_id SET NOT NULL;
DROP INDEX IF EXISTS publications_one_active_uq;
CREATE UNIQUE INDEX IF NOT EXISTS publications_one_active_per_cause_uq
  ON publications(cause_id) WHERE state='active';
CREATE INDEX IF NOT EXISTS publications_cause_sequence_idx ON publications(cause_id,sequence DESC);

ALTER TABLE publication_artifacts ALTER COLUMN cause_slug DROP DEFAULT;
CREATE FUNCTION bind_artifact_cause() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text;
BEGIN
  SELECT c.slug INTO expected FROM publications p JOIN causes c ON c.id=p.cause_id WHERE p.id=NEW.publication_id;
  IF expected IS NULL THEN RAISE EXCEPTION 'Artifact publication has no cause'; END IF;
  IF NEW.cause_slug IS NULL THEN NEW.cause_slug := expected; END IF;
  IF NEW.cause_slug <> expected THEN RAISE EXCEPTION 'Artifact cause differs from its publication'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publication_artifact_cause BEFORE INSERT OR UPDATE ON publication_artifacts
FOR EACH ROW EXECUTE FUNCTION bind_artifact_cause();
COMMIT;
''')
