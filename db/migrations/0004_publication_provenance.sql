BEGIN;

CREATE TABLE publication_policy_revisions (
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  policy_revision_id uuid NOT NULL REFERENCES policy_revisions(id),
  PRIMARY KEY (publication_id, policy_revision_id)
);

INSERT INTO publication_policy_revisions (publication_id, policy_revision_id)
SELECT id, policy_revision_id
FROM publications
ON CONFLICT DO NOTHING;

ALTER TABLE publications
  DROP COLUMN policy_revision_id;

ALTER TABLE publication_artifacts
  ADD CONSTRAINT publication_artifacts_delta_base_ck
  CHECK ((artifact_kind = 'delta') = (base_version IS NOT NULL));

CREATE UNIQUE INDEX publication_artifacts_storage_key_uq
  ON publication_artifacts(storage_key);

CREATE UNIQUE INDEX publication_artifacts_full_uq
  ON publication_artifacts(publication_id, channel, list_kind, version)
  WHERE artifact_kind = 'full';

CREATE UNIQUE INDEX publication_artifacts_delta_uq
  ON publication_artifacts(publication_id, channel, list_kind, version, base_version)
  WHERE artifact_kind = 'delta';

CREATE INDEX publication_policy_revisions_revision_idx
  ON publication_policy_revisions(policy_revision_id, publication_id);

COMMIT;
