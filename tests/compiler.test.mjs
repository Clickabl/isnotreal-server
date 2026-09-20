import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileEntries,
  compileFullPublication,
  compilePublicationDelta,
} from '../packages/application/dist/index.js';
import { canonicalJson } from '../packages/protocol/dist/index.js';
const candidate = (
  cause = 'israel-palestine',
  identifier = '1',
  reasonCodes = ['C03'],
  entityId = '9',
) => ({ cause, channel: 'x', list: 'filter', identifier, entityId, reasonCodes });
const full = (version, candidates) =>
  compileFullPublication({
    cause: 'israel-palestine',
    channel: 'x',
    list: 'filter',
    version,
    reasonCatalogVersion: 1,
    generatedAt: '2026-09-20T00:00:00.000Z',
    expiresAt: '2026-09-22T00:00:00.000Z',
    candidates,
  });
test('compiler keeps cause partitions independent and tuples minimal', () => {
  assert.deepEqual(
    compileEntries(
      [
        candidate(),
        candidate('russia-ukraine', '2'),
        candidate('israel-palestine', '1', ['C05', 'C03']),
      ],
      'israel-palestine',
      'x',
      'filter',
    ),
    [['1', '9', ['C03', 'C05']]],
  );
});
test('conflicting identity in one partition cannot compile', () => {
  assert.throws(
    () =>
      compileEntries(
        [candidate(), candidate('israel-palestine', '1', ['C03'], '999')],
        'israel-palestine',
        'x',
        'filter',
      ),
    /multiple entities/,
  );
});
test('delta includes removals and upserts and rejects cross-cause input', () => {
  const before = full('1', [candidate(), candidate('israel-palestine', '2')]);
  const after = full('2', [candidate('israel-palestine', '1', ['C05'])]);
  const delta = compilePublicationDelta(before, after);
  assert.deepEqual(delta.added, [['1', '9', ['C05']]]);
  assert.deepEqual(delta.removed, ['2']);
  assert.equal(delta.cause, 'israel-palestine');
  assert.equal(delta.schemaVersion, 5);
  assert.throws(
    () => compilePublicationDelta(before, { ...after, cause: 'russia-ukraine' }),
    /different causes/,
  );
});
test('canonical serialization is stable and rejects unsupported values', () => {
  assert.equal(canonicalJson({ z: 1, a: { b: 2, a: 3 } }), '{"a":{"a":3,"b":2},"z":1}');
  assert.throws(() => canonicalJson({ x: undefined }));
  assert.throws(() => canonicalJson(NaN));
});
