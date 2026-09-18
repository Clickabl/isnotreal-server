BEGIN;

ALTER TABLE community_submissions
  ADD COLUMN reviewed_by text NULL,
  ADD COLUMN review_note text NOT NULL DEFAULT '';

CREATE TABLE membership_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  assertion_id uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  proposed_list text NOT NULL CHECK (proposed_list IN ('filter', 'highlight')),
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'approved', 'rejected', 'withdrawn', 'applied')
  ),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,
  review_note text NOT NULL DEFAULT '',
  applied_decision_id uuid NULL REFERENCES membership_decisions(id),
  applied_at timestamptz NULL,
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK ((state = 'applied') = (applied_decision_id IS NOT NULL)),
  UNIQUE (entity_id, assertion_id, reason_code, proposed_list)
);

CREATE INDEX membership_proposals_queue_idx
  ON membership_proposals(state, created_at);

CREATE INDEX membership_proposals_entity_idx
  ON membership_proposals(entity_id, proposed_list, state);

INSERT INTO policies (slug, name, description)
VALUES (
  'default-publication-policy',
  'Default publication policy',
  'Human-reviewed list membership generated from a published reason catalog and validated evidence.'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO policy_revisions (policy_id, version, rules, state, effective_at)
SELECT
  policy.id,
  1,
  jsonb_build_object(
    'membership', 'human-reviewed',
    'reasonDirection', 'catalog-default-list',
    'evidenceGate', 'membership_reason_validation'
  ),
  'active',
  now()
FROM policies policy
WHERE policy.slug = 'default-publication-policy'
  AND NOT EXISTS (
    SELECT 1
    FROM policy_revisions revision
    WHERE revision.policy_id = policy.id
  );

COMMIT;
