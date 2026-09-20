BEGIN;

CREATE TABLE causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  default_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO causes (slug, name, description, default_enabled, sort_order) VALUES
  (
    'epstein-records',
    'Epstein-related records',
    'Source-backed records concerning appearances or documented relationships in released Epstein-related material. A record match is not itself an allegation or finding of wrongdoing.',
    false,
    10
  ),
  (
    'trump-maga',
    'Trump / MAGA',
    'Source-backed public endorsements, campaign roles, explicit self-identification, funding records where legally reusable, and other specifically documented activity.',
    false,
    20
  ),
  (
    'israel-palestine',
    'Israel / Palestine',
    'Source-backed statements, campaigns, contracts, donations, boycott designations, ceasefire advocacy, humanitarian support, and other specifically documented actions.',
    false,
    30
  ),
  (
    'russia-ukraine',
    'Russia / Ukraine',
    'Source-backed sanctions designations, state or military relationships, business activity, public statements, and humanitarian support concerning Russia and Ukraine.',
    false,
    40
  );

CREATE TABLE reason_causes (
  reason_code text NOT NULL REFERENCES reason_definitions(code) ON DELETE CASCADE,
  cause_id uuid NOT NULL REFERENCES causes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reason_code, cause_id)
);

-- Existing v1 reasons are Israel/Palestine vocabulary. This maps them without
-- changing the meaning or code of any already-published reason catalog.
INSERT INTO reason_causes (reason_code, cause_id)
SELECT rd.code, cause.id
FROM reason_definitions rd
JOIN causes cause ON cause.slug = 'israel-palestine'
WHERE rd.active = true
ON CONFLICT DO NOTHING;

ALTER TABLE membership_decisions
  ADD COLUMN cause_id uuid NULL REFERENCES causes(id);

UPDATE membership_decisions decision
SET cause_id = cause.id
FROM causes cause
WHERE cause.slug = 'israel-palestine'
  AND decision.cause_id IS NULL;

ALTER TABLE membership_decisions
  ALTER COLUMN cause_id SET NOT NULL;

DROP INDEX membership_decisions_one_active_uq;

CREATE UNIQUE INDEX membership_decisions_one_active_uq
  ON membership_decisions(entity_id, cause_id, list_kind)
  WHERE state = 'active';

CREATE INDEX membership_decisions_cause_idx
  ON membership_decisions(cause_id, list_kind, state, entity_id);

ALTER TABLE membership_proposals
  ADD COLUMN cause_id uuid NULL REFERENCES causes(id);

UPDATE membership_proposals proposal
SET cause_id = cause.id
FROM causes cause
WHERE cause.slug = 'israel-palestine'
  AND proposal.cause_id IS NULL;

ALTER TABLE membership_proposals
  ALTER COLUMN cause_id SET NOT NULL;

ALTER TABLE membership_proposals
  DROP CONSTRAINT membership_proposals_entity_id_assertion_id_reason_code_pro_key;

ALTER TABLE membership_proposals
  ADD CONSTRAINT membership_proposals_unique_cause_reason
  UNIQUE (entity_id, assertion_id, reason_code, cause_id, proposed_list);

ALTER TABLE publications
  ADD COLUMN cause_id uuid NULL REFERENCES causes(id);

UPDATE publications publication
SET cause_id = cause.id
FROM causes cause
WHERE cause.slug = 'israel-palestine'
  AND publication.cause_id IS NULL;

ALTER TABLE publications
  ALTER COLUMN cause_id SET NOT NULL;

DROP INDEX publications_one_active_uq;

CREATE UNIQUE INDEX publications_one_active_per_cause_uq
  ON publications(cause_id)
  WHERE state = 'active';

CREATE INDEX publications_cause_sequence_idx
  ON publications(cause_id, sequence DESC);

COMMIT;
