BEGIN;

CREATE TABLE identifier_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_id uuid NOT NULL REFERENCES identifiers(id) ON DELETE CASCADE,
  alias_type text NOT NULL CHECK (alias_type IN ('handle', 'display-name', 'former-handle', 'legacy-url', 'other')),
  value text NOT NULL CHECK (length(btrim(value)) > 0),
  normalized_value text NOT NULL CHECK (length(btrim(normalized_value)) > 0),
  first_seen_at timestamptz NULL,
  last_seen_at timestamptz NULL,
  verification_assertion_id uuid NULL REFERENCES assertions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_seen_at IS NULL OR first_seen_at IS NULL OR last_seen_at >= first_seen_at),
  UNIQUE (identifier_id, alias_type, normalized_value)
);

CREATE INDEX identifier_aliases_lookup_idx
  ON identifier_aliases(identifier_id, alias_type);

ALTER TABLE alternative_destinations
  ADD COLUMN review_event_id uuid NULL REFERENCES review_events(id);

CREATE INDEX alternative_destinations_verified_idx
  ON alternative_destinations(entity_id, channel, priority)
  WHERE active = true AND verified_at IS NOT NULL;

COMMIT;
