BEGIN;

CREATE FUNCTION protect_reason_catalog_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  catalog_state text;
  catalog_id uuid;
BEGIN
  catalog_id := COALESCE(NEW.catalog_version_id, OLD.catalog_version_id);

  SELECT state
  INTO catalog_state
  FROM reason_catalog_versions
  WHERE id = catalog_id;

  IF catalog_state IS NULL THEN
    RAISE EXCEPTION 'reason catalog version does not exist';
  END IF;

  IF catalog_state <> 'draft' THEN
    RAISE EXCEPTION 'reason catalog entries are immutable once catalog leaves draft state';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER reason_catalog_entries_immutable_after_draft
BEFORE INSERT OR UPDATE OR DELETE ON reason_catalog_entries
FOR EACH ROW
EXECUTE FUNCTION protect_reason_catalog_entry();

CREATE FUNCTION protect_reason_catalog_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state <> 'draft' THEN
    IF NEW.version IS DISTINCT FROM OLD.version
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'published reason catalog metadata is immutable';
    END IF;

    IF OLD.state = 'retired' AND NEW.state <> 'retired' THEN
      RAISE EXCEPTION 'retired reason catalog versions cannot be reactivated';
    END IF;

    IF OLD.state = 'active' AND NEW.state NOT IN ('active', 'retired') THEN
      RAISE EXCEPTION 'active reason catalog can only remain active or be retired';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reason_catalog_versions_immutable_metadata
BEFORE UPDATE ON reason_catalog_versions
FOR EACH ROW
EXECUTE FUNCTION protect_reason_catalog_version();

COMMIT;
