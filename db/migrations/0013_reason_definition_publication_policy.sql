BEGIN;

ALTER TABLE reason_definitions
  ADD COLUMN publication_enabled boolean NOT NULL DEFAULT true;

UPDATE reason_definitions
SET publication_enabled = false,
    updated_at = now()
WHERE code IN ('C19', 'C20');

COMMENT ON COLUMN reason_definitions.publication_enabled IS
  'Editable working-policy flag copied into the next immutable reason-catalog snapshot. Does not alter already-published catalog versions.';

COMMIT;
