BEGIN;

-- Reason codes are stable factual labels and belong to one cause. If the same
-- wording is useful elsewhere, create a distinct reason code so publications and
-- trusted imports never have to guess which user-selectable cause is affected.
CREATE UNIQUE INDEX reason_causes_one_cause_per_reason_uq
  ON reason_causes(reason_code);

COMMENT ON INDEX reason_causes_one_cause_per_reason_uq IS
  'A reason code has one owning cause; cross-cause evidence reuse happens through assertions, not ambiguous reason ownership.';

COMMIT;
