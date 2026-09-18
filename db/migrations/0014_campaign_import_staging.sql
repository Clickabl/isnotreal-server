BEGIN;

CREATE TABLE campaign_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_version_id uuid NOT NULL REFERENCES campaign_versions(id),
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  source_capture_id uuid NOT NULL REFERENCES source_captures(id),
  import_kind text NOT NULL CHECK (
    import_kind IN ('signatory-list', 'participant-list', 'target-list', 'other')
  ),
  state text NOT NULL DEFAULT 'staged' CHECK (
    state IN ('staged', 'resolving', 'ready', 'committed', 'failed', 'cancelled')
  ),
  source_row_count integer NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz NULL,
  failure_message text NULL
);

CREATE TABLE campaign_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES campaign_import_batches(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  raw_name text NOT NULL CHECK (length(btrim(raw_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_entity_id uuid NULL REFERENCES entities(id),
  resolution_state text NOT NULL DEFAULT 'unresolved' CHECK (
    resolution_state IN (
      'unresolved',
      'candidate',
      'approved',
      'new-entity-needed',
      'ambiguous',
      'skipped',
      'rejected',
      'committed'
    )
  ),
  resolution_method text NULL CHECK (
    resolution_method IS NULL OR resolution_method IN (
      'stable-identifier',
      'exact-canonical-name',
      'exact-alias',
      'manual',
      'new-entity'
    )
  ),
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,
  review_note text NOT NULL DEFAULT '',
  assertion_id uuid NULL REFERENCES assertions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, ordinal),
  CHECK (
    (resolution_state IN ('approved', 'committed') AND resolved_entity_id IS NOT NULL)
    OR resolution_state NOT IN ('approved', 'committed')
  ),
  CHECK (
    (reviewed_at IS NULL) = (reviewed_by IS NULL)
  )
);

CREATE TABLE campaign_import_candidates (
  row_id uuid NOT NULL REFERENCES campaign_import_rows(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  match_basis text NOT NULL CHECK (
    match_basis IN ('stable-identifier', 'canonical-name', 'alias', 'manual-search')
  ),
  score numeric(6,5) NULL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (row_id, entity_id)
);

CREATE TABLE campaign_import_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES campaign_import_batches(id) ON DELETE CASCADE,
  row_id uuid NULL REFERENCES campaign_import_rows(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'row-staged',
      'candidate-found',
      'row-approved',
      'row-rejected',
      'row-skipped',
      'batch-ready',
      'batch-committed',
      'batch-failed'
    )
  ),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_import_batches_queue_idx
  ON campaign_import_batches(state, created_at);

CREATE INDEX campaign_import_rows_resolution_idx
  ON campaign_import_rows(batch_id, resolution_state, ordinal);

CREATE INDEX campaign_import_rows_normalized_name_idx
  ON campaign_import_rows(normalized_name);

CREATE INDEX campaign_import_candidates_entity_idx
  ON campaign_import_candidates(entity_id);

COMMENT ON TABLE campaign_import_rows IS
  'Raw official-list rows remain immutable in raw_name/raw_payload. Entity resolution is a separate reviewed state so name collisions never silently become public assertions.';

COMMIT;
