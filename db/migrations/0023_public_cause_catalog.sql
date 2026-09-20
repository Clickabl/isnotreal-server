BEGIN;

CREATE VIEW public_cause_catalog AS
SELECT
  cause.slug,
  cause.name,
  cause.description,
  cause.default_enabled,
  cause.sort_order,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', rd.code,
        'label', rd.label,
        'description', rd.description,
        'suggestedAction', pref.suggested_action,
        'userSelectable', pref.user_selectable,
        'sortOrder', pref.sort_order
      )
      ORDER BY pref.sort_order, rd.code
    ) FILTER (WHERE rd.code IS NOT NULL),
    '[]'::jsonb
  ) AS reasons
FROM causes cause
LEFT JOIN cause_reason_preferences pref ON pref.cause_id = cause.id
LEFT JOIN reason_definitions rd
  ON rd.code = pref.reason_code
 AND rd.active = true
WHERE cause.active = true
GROUP BY cause.id
ORDER BY cause.sort_order, cause.slug;

COMMENT ON VIEW public_cause_catalog IS
  'Public settings catalog. Contains factual reason labels and suggested presentation only; never user preferences.';

COMMIT;
