BEGIN;
-- Old import helpers may omit cause. Resolve only a unique explicit reason binding;
-- ambiguous multi-cause reasons must use a cause-aware editor, never a guessed default.
CREATE FUNCTION fill_unique_proposal_cause() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE choices uuid[];
BEGIN
  IF NEW.cause_id IS NULL THEN
    SELECT array_agg(rc.cause_id) INTO choices FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id
      WHERE rc.reason_code=NEW.reason_code AND c.active;
    IF coalesce(cardinality(choices),0) <> 1 THEN RAISE EXCEPTION 'explicit cause required for this reason'; END IF;
    NEW.cause_id := choices[1];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reason_causes WHERE reason_code=NEW.reason_code AND cause_id=NEW.cause_id) THEN
    RAISE EXCEPTION 'reason does not belong to cause';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_proposal_cause BEFORE INSERT OR UPDATE ON membership_proposals
FOR EACH ROW EXECUTE PROCEDURE fill_unique_proposal_cause();
COMMIT;
