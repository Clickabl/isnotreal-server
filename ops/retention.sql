BEGIN;

DELETE FROM submission_sources source
USING community_submissions submission
WHERE source.submission_id = submission.id
  AND submission.state IN ('spam','duplicate')
  AND submission.reviewed_at < now() - interval '90 days';

UPDATE community_submissions
SET narrative = '[redacted after abuse-retention window]',
    proposed_identifier = NULL,
    source_locator = NULL,
    submitter_contact_ref = NULL,
    updated_at = now()
WHERE state IN ('spam','duplicate')
  AND reviewed_at < now() - interval '90 days'
  AND narrative <> '[redacted after abuse-retention window]';

COMMIT;
