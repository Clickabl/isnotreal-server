BEGIN;

CREATE TABLE cause_reason_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cause_id uuid NOT NULL REFERENCES causes(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code) ON DELETE CASCADE,
  suggested_action text NOT NULL CHECK (suggested_action IN ('filter', 'highlight', 'informational')),
  user_selectable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cause_id, reason_code)
);

INSERT INTO cause_reason_preferences (
  cause_id, reason_code, suggested_action, user_selectable, sort_order
)
SELECT
  rc.cause_id,
  rc.reason_code,
  CASE rd.default_list
    WHEN 'filter' THEN 'filter'
    WHEN 'highlight' THEN 'highlight'
    ELSE 'informational'
  END,
  true,
  row_number() OVER (PARTITION BY rc.cause_id ORDER BY rd.code) * 10
FROM reason_causes rc
JOIN reason_definitions rd ON rd.code = rc.reason_code
ON CONFLICT DO NOTHING;

COMMENT ON TABLE cause_reason_preferences IS
  'Public cause/reason catalog defaults for UI presentation only. User choices remain local to the extension and are never inferred from this table.';

COMMIT;
