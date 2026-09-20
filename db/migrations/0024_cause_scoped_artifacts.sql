BEGIN;

ALTER TABLE publication_artifacts
  ADD COLUMN cause_slug text NOT NULL DEFAULT 'israel-palestine'
  REFERENCES causes(slug);

DROP INDEX publication_artifacts_identity_uq;

CREATE UNIQUE INDEX publication_artifacts_identity_uq
  ON publication_artifacts(
    publication_id,
    cause_slug,
    channel,
    list_kind,
    artifact_kind,
    COALESCE(base_version, '')
  );

CREATE INDEX publication_artifacts_cause_lookup_idx
  ON publication_artifacts(cause_slug, channel, list_kind, artifact_kind, version);

COMMIT;
