BEGIN;

-- gen_random_uuid() is built in from PostgreSQL 13. Production runs cPanel's
-- PostgreSQL 10 without contrib extensions (no pgcrypto), so define an equivalent
-- version-4 UUID generator only when the built-in one is missing. These UUIDs are
-- row identifiers, not secrets.
DO $uuid$
BEGIN
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    CREATE FUNCTION public.gen_random_uuid() RETURNS uuid
    LANGUAGE sql VOLATILE PARALLEL SAFE AS $fn$
      SELECT (
        substr(h, 1, 12) || '4' || substr(h, 14, 3)
        || substr('89ab', get_byte(decode(substr(h, 17, 2), 'hex'), 0) % 4 + 1, 1)
        || substr(h, 18, 15)
      )::uuid
      FROM (
        SELECT md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text) AS h
      ) AS seed
    $fn$;
  END IF;
END
$uuid$;

CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('person', 'company', 'brand', 'organization', 'music-group', 'other')),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'hidden', 'deleted')),
  merged_into_entity_id uuid NULL REFERENCES entities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'merged') = (merged_into_entity_id IS NOT NULL))
);

COMMENT ON COLUMN entities.public_id IS 'Stable public numeric identifier. Never recycle or expose internal UUIDs to extension payloads.';

CREATE TABLE entity_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  name_type text NOT NULL DEFAULT 'alias' CHECK (name_type IN ('alias', 'legal', 'former', 'stage', 'brand', 'other')),
  locale text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, normalized_name, name_type)
);

CREATE TABLE identifier_kinds (
  code text PRIMARY KEY,
  publication_channel text NULL CHECK (
    publication_channel IS NULL OR publication_channel IN ('x', 'tiktok', 'instagram', 'youtube', 'domain')
  ),
  description text NOT NULL,
  is_domain boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO identifier_kinds (code, publication_channel, description, is_domain) VALUES
  ('x', 'x', 'X/Twitter stable account ID', false),
  ('tiktok', 'tiktok', 'TikTok stable account ID', false),
  ('instagram', 'instagram', 'Instagram stable account ID', false),
  ('youtube', 'youtube', 'YouTube channel ID', false),
  ('domain', 'domain', 'DNS hostname', true),
  ('spotify', NULL, 'Spotify artist or organization identifier', false),
  ('apple-music', NULL, 'Apple Music artist identifier', false),
  ('facebook', NULL, 'Facebook page/account identifier', false),
  ('threads', NULL, 'Threads account identifier', false),
  ('bluesky', NULL, 'Bluesky DID/account identifier', false),
  ('imdb', NULL, 'IMDb person/company identifier', false),
  ('tmdb', NULL, 'TMDB person/company identifier', false),
  ('other', NULL, 'Other externally assigned identifier', false);

CREATE TABLE identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_code text NOT NULL REFERENCES identifier_kinds(code),
  value text NOT NULL CHECK (length(btrim(value)) > 0),
  normalized_value text NOT NULL CHECK (length(btrim(normalized_value)) > 0),
  display_value text NOT NULL CHECK (length(btrim(display_value)) > 0),
  match_scope text NOT NULL DEFAULT 'exact' CHECK (match_scope IN ('exact', 'include-subdomains')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'reassigned', 'unverified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind_code, normalized_value),
  CHECK (match_scope = 'exact' OR kind_code = 'domain')
);

CREATE TABLE source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL UNIQUE CHECK (canonical_url ~ '^https?://'),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  publisher text NULL,
  source_type text NOT NULL CHECK (source_type IN ('primary', 'campaign', 'news', 'filing', 'archive', 'other')),
  first_published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL,
  content_hash text NULL CHECK (content_hash IS NULL OR content_hash ~ '^[a-fA-F0-9]{64}$'),
  storage_uri text NULL,
  capture_method text NOT NULL CHECK (capture_method IN ('manual', 'http', 'archive', 'api', 'other')),
  http_status integer NULL CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'missing', 'blocked', 'invalid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, retrieved_at)
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  organization_entity_id uuid NULL REFERENCES entities(id),
  website_url text NULL CHECK (website_url IS NULL OR website_url ~ '^https?://'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'archived')),
  launched_on date NULL,
  ended_on date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR launched_on IS NULL OR ended_on >= launched_on)
);

CREATE TABLE campaign_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  source_document_id uuid NULL REFERENCES source_documents(id),
  effective_from timestamptz NULL,
  effective_to timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE TABLE assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_entity_id uuid NULL REFERENCES entities(id),
  action_type text NOT NULL CHECK (length(btrim(action_type)) > 0),
  campaign_version_id uuid NULL REFERENCES campaign_versions(id),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  occurred_on date NULL,
  occurred_at timestamptz NULL,
  date_precision text NOT NULL DEFAULT 'unknown' CHECK (date_precision IN ('instant', 'day', 'month', 'year', 'unknown', 'ongoing')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'under-review', 'published', 'withdrawn', 'disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assertion_participants (
  assertion_id uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('actor', 'signer', 'donor', 'recipient', 'supplier', 'customer', 'organizer', 'participant', 'beneficiary', 'target', 'other')),
  PRIMARY KEY (assertion_id, entity_id, role)
);

CREATE TABLE assertion_source_links (
  assertion_id uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES source_captures(id),
  locator text NULL,
  evidence_note text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  stance text NOT NULL DEFAULT 'supports' CHECK (stance IN ('supports', 'contradicts', 'context')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assertion_id, capture_id, stance)
);

CREATE TABLE identifier_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_id uuid NOT NULL REFERENCES identifiers(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'unverified' CHECK (state IN ('unverified', 'verified', 'revoked')),
  valid_from timestamptz NULL,
  valid_to timestamptz NULL,
  verification_assertion_id uuid NULL REFERENCES assertions(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX identifier_assignments_current_verified_uq
  ON identifier_assignments(identifier_id)
  WHERE state = 'verified' AND valid_to IS NULL;

CREATE TABLE entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('owns', 'controls', 'brand-of', 'member-of', 'licenses', 'operates')),
  ownership_percent numeric(5,2) NULL CHECK (ownership_percent IS NULL OR (ownership_percent >= 0 AND ownership_percent <= 100)),
  evidence_assertion_id uuid NULL REFERENCES assertions(id),
  valid_from timestamptz NULL,
  valid_to timestamptz NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_entity_id <> to_entity_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX entity_relationships_current_verified_uq
  ON entity_relationships(from_entity_id, to_entity_id, relationship_type)
  WHERE status = 'verified' AND valid_to IS NULL;

CREATE TABLE reason_definitions (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,15}$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  category text NOT NULL CHECK (length(btrim(category)) > 0),
  default_list text NOT NULL DEFAULT 'none' CHECK (default_list IN ('filter', 'highlight', 'none')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assertion_reasons (
  assertion_id uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  PRIMARY KEY (assertion_id, reason_code)
);

CREATE TABLE policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'retired')),
  effective_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version)
);

CREATE UNIQUE INDEX policy_revisions_one_active_uq
  ON policy_revisions(policy_id)
  WHERE state = 'active';

CREATE TABLE membership_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  list_kind text NOT NULL CHECK (list_kind IN ('filter', 'highlight')),
  decision text NOT NULL CHECK (decision IN ('include', 'exclude')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'superseded')),
  policy_revision_id uuid NOT NULL REFERENCES policy_revisions(id),
  decided_at timestamptz NOT NULL,
  supersedes_decision_id uuid NULL REFERENCES membership_decisions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX membership_decisions_one_active_uq
  ON membership_decisions(entity_id, list_kind)
  WHERE state = 'active';

CREATE TABLE membership_decision_reasons (
  decision_id uuid NOT NULL REFERENCES membership_decisions(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  assertion_id uuid NOT NULL REFERENCES assertions(id),
  PRIMARY KEY (decision_id, reason_code, assertion_id)
);

CREATE TABLE review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'corrected', 'withdrawn', 'restored')),
  reviewer_id text NOT NULL CHECK (length(btrim(reviewer_id)) > 0),
  rationale text NOT NULL DEFAULT '',
  supersedes_event_id uuid NULL REFERENCES review_events(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id),
  statement text NOT NULL CHECK (length(btrim(statement)) > 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'under-review', 'resolved', 'dismissed')),
  submitter_contact_ref text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE TABLE dispute_reasons (
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES reason_definitions(code),
  PRIMARY KEY (dispute_id, reason_code)
);

CREATE TABLE correction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NULL REFERENCES disputes(id),
  assertion_id uuid NOT NULL REFERENCES assertions(id),
  explanation text NOT NULL CHECK (length(btrim(explanation)) > 0),
  review_event_id uuid NOT NULL REFERENCES review_events(id),
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NULL REFERENCES entities(id),
  identifier_kind text NULL,
  identifier_value text NULL,
  submission_type text NOT NULL CHECK (submission_type IN (
    'add-evidence', 'incorrect-information', 'changed-position', 'wrong-identifier',
    'missing-identifier', 'company-relationship', 'suggest-alternative', 'new-entity'
  )),
  proposed_list text NULL CHECK (proposed_list IS NULL OR proposed_list IN ('filter', 'highlight')),
  proposed_reason_code text NULL,
  narrative text NOT NULL CHECK (length(btrim(narrative)) >= 3),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'triaged', 'accepted', 'rejected', 'duplicate')),
  submitter_contact_ref text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL
);

CREATE TABLE submission_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES community_submissions(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https?://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, url)
);

CREATE TABLE entity_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alternative_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  context_key text NOT NULL DEFAULT 'general',
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'similar-creator', 'similar-service', 'direct-competitor', 'indie-alternative',
    'local-alternative', 'community-recommended', 'other'
  )),
  rank integer NOT NULL DEFAULT 100 CHECK (rank >= 0),
  rationale text NULL,
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'retired')),
  review_event_id uuid NULL REFERENCES review_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_entity_id <> alternative_entity_id),
  UNIQUE (source_entity_id, alternative_entity_id, context_key)
);

CREATE TABLE alternative_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  identifier_id uuid NULL REFERENCES identifiers(id),
  channel text NULL,
  destination_url text NOT NULL CHECK (destination_url ~ '^https://'),
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, destination_url)
);

CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  protocol_version integer NOT NULL CHECK (protocol_version > 0),
  policy_revision_id uuid NOT NULL REFERENCES policy_revisions(id),
  compiler_version text NOT NULL,
  source_revision text NOT NULL,
  state text NOT NULL DEFAULT 'building' CHECK (state IN ('building', 'ready', 'active', 'retired', 'failed')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX publications_one_active_uq
  ON publications((true))
  WHERE state = 'active';

CREATE TABLE publication_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('x', 'tiktok', 'instagram', 'youtube', 'domain')),
  list_kind text NOT NULL CHECK (list_kind IN ('filter', 'highlight')),
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('full', 'delta', 'manifest')),
  version text NOT NULL,
  base_version text NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-fA-F0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  entry_count bigint NOT NULL CHECK (entry_count >= 0),
  signature_key_id text NULL,
  signature text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, channel, list_kind, artifact_kind, version, base_version)
);

CREATE INDEX entities_name_fts_idx ON entities USING gin (to_tsvector('simple', canonical_name));
CREATE INDEX entity_names_normalized_idx ON entity_names(normalized_name);
CREATE INDEX identifiers_kind_status_idx ON identifiers(kind_code, status);
CREATE INDEX identifier_assignments_entity_idx ON identifier_assignments(entity_id) WHERE state = 'verified';
CREATE INDEX assertions_entity_state_idx ON assertions(primary_entity_id, state);
CREATE INDEX assertion_participants_entity_idx ON assertion_participants(entity_id, role);
CREATE INDEX assertion_source_links_capture_idx ON assertion_source_links(capture_id);
CREATE INDEX membership_decisions_entity_idx ON membership_decisions(entity_id, list_kind, state);
CREATE INDEX membership_decision_reasons_assertion_idx ON membership_decision_reasons(assertion_id);
CREATE INDEX community_submissions_queue_idx ON community_submissions(state, submitted_at);
CREATE INDEX entity_alternatives_source_idx ON entity_alternatives(source_entity_id, state, context_key, rank);
CREATE INDEX publication_artifacts_lookup_idx ON publication_artifacts(channel, list_kind, version);

CREATE VIEW publication_candidates AS
SELECT
  ik.publication_channel AS channel,
  md.list_kind,
  i.normalized_value AS identifier,
  e.public_id::text AS entity_public_id,
  array_agg(DISTINCT mdr.reason_code ORDER BY mdr.reason_code) AS reason_codes
FROM membership_decisions md
JOIN entities e
  ON e.id = md.entity_id
 AND e.status = 'active'
JOIN membership_decision_reasons mdr
  ON mdr.decision_id = md.id
JOIN reason_definitions rd
  ON rd.code = mdr.reason_code
 AND rd.active = true
JOIN assertions a
  ON a.id = mdr.assertion_id
 AND a.state = 'published'
JOIN identifier_assignments ia
  ON ia.entity_id = e.id
 AND ia.state = 'verified'
 AND ia.valid_to IS NULL
JOIN identifiers i
  ON i.id = ia.identifier_id
 AND i.status = 'active'
JOIN identifier_kinds ik
  ON ik.code = i.kind_code
 AND ik.publication_channel IS NOT NULL
WHERE md.state = 'active'
  AND md.decision = 'include'
GROUP BY ik.publication_channel, md.list_kind, i.normalized_value, e.public_id;

COMMENT ON VIEW publication_candidates IS
  'Compiler projection only: stable identifier + public entity id + display reason codes. Evidence and names never enter extension payloads.';

COMMIT;
