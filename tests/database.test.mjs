import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const coreMigration = await readFile(
  new URL('../db/migrations/0001_core.sql', import.meta.url),
  'utf8',
);
const scaleMigration = await readFile(
  new URL('../db/migrations/0002_resolution_and_search.sql', import.meta.url),
  'utf8',
);

test('core migration separates truth, identifiers, policy and publication', () => {
  for (const table of [
    'entities',
    'identifiers',
    'identifier_assignments',
    'source_documents',
    'source_captures',
    'campaigns',
    'assertions',
    'assertion_participants',
    'reason_definitions',
    'membership_decisions',
    'community_submissions',
    'entity_alternatives',
    'alternative_destinations',
    'publications',
    'publication_artifacts',
  ]) {
    assert.match(coreMigration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(coreMigration, /CREATE VIEW publication_candidates/);
  assert.match(coreMigration, /e\.public_id::text AS entity_public_id/);
  assert.match(coreMigration, /array_agg\(DISTINCT mdr\.reason_code/);
});

test('scale migration resolves merge chains and indexes substring search', () => {
  assert.match(scaleMigration, /WITH RECURSIVE chain/);
  assert.match(scaleMigration, /WHERE NOT target\.id = ANY\(chain\.path\)/);
  assert.match(scaleMigration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(scaleMigration, /canonical_name gin_trgm_ops/);
  assert.match(scaleMigration, /name gin_trgm_ops/);
});
