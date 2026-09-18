BEGIN;

ALTER TABLE publications
  ADD COLUMN reason_catalog_version integer NULL;

UPDATE publications p
SET reason_catalog_version = rcv.version
FROM reason_catalog_versions rcv
WHERE rcv.state = 'active'
  AND p.reason_catalog_version IS NULL;

ALTER TABLE publications
  ALTER COLUMN reason_catalog_version SET NOT NULL;

ALTER TABLE publications
  ADD CONSTRAINT publications_reason_catalog_version_fk
  FOREIGN KEY (reason_catalog_version)
  REFERENCES reason_catalog_versions(version);

CREATE INDEX publications_reason_catalog_version_idx
  ON publications(reason_catalog_version, sequence);

COMMENT ON COLUMN publications.reason_catalog_version IS
  'Reason-code vocabulary version used to compile this immutable publication. Clients must sync the corresponding compact reason-label dictionary before displaying codes.';

COMMIT;
