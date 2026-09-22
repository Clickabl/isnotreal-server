BEGIN;

CREATE TABLE source_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  previous_capture_id uuid NOT NULL REFERENCES source_captures(id),
  new_capture_id uuid NOT NULL UNIQUE REFERENCES source_captures(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','reviewed','ignored')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewer_id text NULL,
  review_note text NOT NULL DEFAULT ''
);

CREATE INDEX source_change_events_queue_idx
  ON source_change_events(state, detected_at DESC);

COMMIT;
