BEGIN;

-- Additive migration: deployed migration checksums remain unchanged.
ALTER TABLE community_submissions DROP CONSTRAINT community_submissions_submission_type_check;
ALTER TABLE community_submissions ADD CONSTRAINT community_submissions_submission_type_check CHECK (submission_type IN (
  'add-evidence', 'incorrect-information', 'changed-position', 'wrong-identifier',
  'missing-identifier', 'company-relationship', 'suggest-alternative', 'new-entity',
  'product-feedback', 'bug-report', 'accessibility-feedback', 'abuse-report'
));
ALTER TABLE community_submissions DROP CONSTRAINT community_submissions_state_check;
ALTER TABLE community_submissions ADD CONSTRAINT community_submissions_state_check CHECK (state IN (
  'pending', 'triaged', 'accepted', 'rejected', 'duplicate', 'spam'
));
ALTER TABLE community_submissions
  ADD COLUMN client_request_id uuid NULL,
  ADD COLUMN content_fingerprint text NULL CHECK (content_fingerprint IS NULL OR content_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN duplicate_of uuid NULL REFERENCES community_submissions(id) ON DELETE SET NULL,
  ADD COLUMN queue text GENERATED ALWAYS AS (CASE
    WHEN submission_type = 'abuse-report' THEN 'safety'
    WHEN submission_type IN ('product-feedback', 'bug-report', 'accessibility-feedback') THEN 'product'
    ELSE 'evidence' END) STORED,
  ADD CONSTRAINT community_submissions_not_self_duplicate CHECK (duplicate_of IS NULL OR duplicate_of <> id),
  ADD CONSTRAINT community_submissions_client_request_uq UNIQUE (client_request_id);
CREATE INDEX community_submissions_inbox_idx ON community_submissions(queue, state, submitted_at, id);
CREATE INDEX community_submissions_fingerprint_idx ON community_submissions(content_fingerprint, submitted_at) WHERE content_fingerprint IS NOT NULL;
COMMENT ON COLUMN community_submissions.client_request_id IS 'Random per-form idempotency key, never a persistent user/device identifier.';
COMMENT ON COLUMN community_submissions.content_fingerprint IS 'Exact-content duplicate hint for reviewers, not grounds for automatic rejection.';
COMMIT;
