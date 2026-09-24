BEGIN;

ALTER TABLE community_submissions
  DROP CONSTRAINT community_submissions_submission_type_check,
  DROP CONSTRAINT community_submissions_state_check;

ALTER TABLE community_submissions
  ADD CONSTRAINT community_submissions_submission_type_check
  CHECK (submission_type IN (
    'add-evidence', 'incorrect-information', 'changed-position', 'wrong-identifier',
    'missing-identifier', 'company-relationship', 'suggest-alternative', 'new-entity',
    'product-feedback', 'bug-report', 'accessibility-feedback', 'abuse-report'
  )),
  ADD CONSTRAINT community_submissions_state_check
  CHECK (state IN ('pending', 'triaged', 'accepted', 'rejected', 'duplicate', 'spam'));

CREATE INDEX community_submissions_moderation_queue_idx
  ON community_submissions(state, submission_type, submitted_at);

COMMIT;
