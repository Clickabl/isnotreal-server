import assert from 'node:assert/strict';
import test from 'node:test';
import { compileEntries, compilePublicationDelta } from '../packages/application/dist/index.js';

test('compiler emits identifier, entity id and deduplicated reason codes only', () => {
  const rows = [
    {
      channel: 'tiktok',
      list: 'filter',
      identifier: '200',
      entityId: '42',
      reasonCodes: ['I02'],
    },
    {
      channel: 'tiktok',
      list: 'filter',
      identifier: '200',
      entityId: '42',
      reasonCodes: ['I05', 'I02'],
    },
    {
      channel: 'tiktok',
      list: 'filter',
      identifier: '100',
      entityId: '7',
      reasonCodes: ['I01'],
    },
    {
      channel: 'tiktok',
      list: 'highlight',
      identifier: '300',
      entityId: '9',
      reasonCodes: ['P03'],
    },
  ];
  assert.deepEqual(compileEntries(rows, 'tiktok', 'filter'), [
    ['100', '7', ['I01']],
    ['200', '42', ['I02', 'I05']],
  ]);
});

test('compiler rejects one stable identifier resolving to two entities', () => {
  const rows = [
    {
      channel: 'x',
      list: 'filter',
      identifier: '123',
      entityId: '1',
      reasonCodes: ['I01'],
    },
    {
      channel: 'x',
      list: 'filter',
      identifier: '123',
      entityId: '2',
      reasonCodes: ['I01'],
    },
  ];
  assert.throws(() => compileEntries(rows, 'x', 'filter'), /multiple entities/);
});

test('delta compiler emits removals and changed entries as deterministic upserts', () => {
  const previous = {
    schemaVersion: 4,
    channel: 'domain',
    list: 'filter',
    version: '10',
    reasonCatalogVersion: 1,
    generatedAt: '2026-09-15T00:00:00Z',
    expiresAt: '2026-09-16T00:00:00Z',
    entries: [
      ['a.example', '1', ['C01']],
      ['b.example', '2', ['C02']],
    ],
  };
  const next = {
    ...previous,
    version: '11',
    entries: [
      ['b.example', '2', ['C02', 'C03']],
      ['c.example', '3', ['C04']],
    ],
  };

  assert.deepEqual(compilePublicationDelta(previous, next), {
    schemaVersion: 4,
    channel: 'domain',
    list: 'filter',
    fromVersion: '10',
    toVersion: '11',
    reasonCatalogVersion: 1,
    added: [
      ['b.example', '2', ['C02', 'C03']],
      ['c.example', '3', ['C04']],
    ],
    removed: ['a.example'],
  });
});
