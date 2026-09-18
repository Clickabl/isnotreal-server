BEGIN;

ALTER TABLE source_captures
  ADD COLUMN final_url text NULL CHECK (final_url IS NULL OR final_url ~ '^https?://'),
  ADD COLUMN content_type text NULL,
  ADD COLUMN byte_size bigint NULL CHECK (byte_size IS NULL OR byte_size >= 0),
  ADD COLUMN etag text NULL,
  ADD COLUMN last_modified text NULL;

CREATE INDEX source_captures_document_hash_idx
  ON source_captures(document_id, content_hash)
  WHERE content_hash IS NOT NULL AND status = 'available';

COMMIT;
