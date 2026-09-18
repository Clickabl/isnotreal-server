BEGIN;

ALTER TABLE campaign_import_events RENAME TO official_import_events;
ALTER TABLE campaign_import_candidates RENAME TO official_import_candidates;
ALTER TABLE campaign_import_rows RENAME TO official_import_rows;
ALTER TABLE campaign_import_batches RENAME TO official_import_batches;

ALTER TABLE official_import_batches
  ALTER COLUMN campaign_version_id DROP NOT NULL,
  ADD COLUMN authority_source_document_id uuid NULL REFERENCES source_documents(id),
  ADD COLUMN source_context text NOT NULL DEFAULT 'campaign' CHECK (
    source_context IN ('campaign', 'authority-list')
  );

ALTER TABLE official_import_batches
  ADD CONSTRAINT official_import_batches_source_context_ck
  CHECK (
    (source_context = 'campaign' AND campaign_version_id IS NOT NULL AND authority_source_document_id IS NULL)
    OR
    (source_context = 'authority-list' AND campaign_version_id IS NULL AND authority_source_document_id IS NOT NULL)
  );

CREATE INDEX official_import_batches_authority_idx
  ON official_import_batches(authority_source_document_id, reason_code)
  WHERE source_context = 'authority-list';

COMMENT ON TABLE official_import_batches IS
  'Reviewed staging for named-campaign membership and authoritative lists. Raw rows never create entities, assertions, or list membership without explicit identity review.';

COMMIT;
