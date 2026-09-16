import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../packages/protocol/src/index.ts', import.meta.url),
  'utf8',
);

test('compiled entry is stripped to identifier, public entity id and reason codes', () => {
  assert.match(source, /export type CompiledEntry = readonly \[/);
  assert.match(source, /identifier: IdentifierValue/);
  assert.match(source, /entityId: PublicEntityId/);
  assert.match(source, /reasonCodes: readonly ReasonCode\[\]/);
  for (const forbidden of [
    'displayName',
    'canonicalName',
    'evidenceIds',
    'sourceIds',
    'biography',
  ]) {
    assert.equal(source.includes(forbidden), false, `protocol must not expose ${forbidden}`);
  }
});

test('domain matching preserves exact and include-subdomains semantics', () => {
  assert.match(source, /PublicationChannel = Platform \| 'domain' \| 'domain-subdomains'/);
  assert.match(source, /ListKind = 'filter' \| 'highlight'/);
  assert.match(source, /PROTOCOL_SCHEMA_VERSION = 3/);
});
