BEGIN;

CREATE TABLE publication_artifact_payloads (
  storage_key text PRIMARY KEY CHECK (storage_key ~ '^publications/[a-z0-9-]+/[1-9][0-9]*/'),
  compressed_payload bytea NOT NULL CHECK (octet_length(compressed_payload) <= 68157440),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 0 AND 67108864),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE publications ADD COLUMN content_sha256 text
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');

COMMIT;
