import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../db/migrations/0001_core.sql', import.meta.url), 'utf8');

test('core migration separates truth, identifiers, policy and publication', () => {
  for (const table of [
    'entities', 'identifiers', 'identifier_assignments', 'source_documents', 'source_captures',
    'campaigns', 'assertions', 'assertion_participants', 'reason_definitions', 'membership_decisions',
    'community_submissions', 'entity_alternatives', 'alternative_destinations', 'publications',
    'publication_artifacts',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(migration, /CREATE VIEW publication_candidates/);
  assert.match(migration, /e\.public_id::text AS entity_public_id/);
  assert.match(migration, /array_agg\(DISTINCT mdr\.reason_code/);
});
