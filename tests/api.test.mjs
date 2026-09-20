import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRouter } from '../apps/api/dist/index.js';
const reason = {
  code: 'P03',
  label: 'Signed example campaign',
  description: 'Documented signature',
  category: 'campaign',
  defaultList: 'highlight',
  publicationEnabled: true,
  evidenceRequirement: null,
  campaigns: [],
  authoritySources: [],
};
const entity = {
  publicId: '42',
  slug: 'example',
  name: 'Example',
  kind: 'person',
  lists: [],
  identifiers: [],
  relationships: [],
  reasons: [],
};
const reasons = {
  async version() {
    return 1;
  },
  async list(version) {
    return !version || version === 1 ? [reason] : [];
  },
  async byCode(code, version) {
    return code === 'P03' && (!version || version === 1) ? reason : null;
  },
};
const publications = {
  async manifest(cause, channel, list) {
    return { schemaVersion: 5, cause, channel, list, version: '1', reasonCatalogVersion: 1 };
  },
  async full(cause, channel, list) {
    return { ...(await this.manifest(cause, channel, list)), entries: [] };
  },
  async delta(cause, channel, list) {
    return {
      schemaVersion: 5,
      code: 'FULL_SYNC_REQUIRED',
      cause,
      channel,
      list,
      currentVersion: '1',
      currentReasonCatalogVersion: 1,
    };
  },
};
const route = createApiRouter({
  entities: {
    async byPublicId() {
      return entity;
    },
    async bySlug() {
      return entity;
    },
    async search() {
      return [entity];
    },
  },
  reasons,
  publications,
  causes: {
    async list() {
      return [];
    },
    async bySlug() {
      return null;
    },
  },
  alternatives: {
    async list() {
      return [];
    },
    async preferred() {
      return null;
    },
  },
  submissions: {
    async create(input) {
      assert.equal(new Set(input.sourceUrls).size, input.sourceUrls.length);
      return { id: 'receipt', state: 'pending' };
    },
  },
});
const request = (method, pathname, query = {}, body = null) => ({ method, pathname, query, body });
test('cause, reason, entity and cause-scoped synchronization routes', async () => {
  assert.equal((await route(request('GET', '/api/v1/causes'))).status, 200);
  assert.equal((await route(request('GET', '/api/v1/causes/unknown'))).status, 404);
  assert.equal((await route(request('GET', '/api/v1/search', { q: 'a' }))).status, 400);
  assert.equal((await route(request('GET', '/api/v1/entities/42'))).body.publicId, '42');
  assert.equal((await route(request('GET', '/api/v1/entities/slug/example'))).body.slug, 'example');
  assert.equal((await route(request('GET', '/api/v1/reasons/P03'))).body.reason.code, 'P03');
  assert.equal((await route(request('GET', '/api/v1/reasons/P99'))).status, 404);
  assert.equal((await route(request('GET', '/api/v1/reasons', { version: 'bad' }))).status, 400);
  assert.equal((await route(request('GET', '/api/v1/reason-catalogs/999/compact'))).status, 404);
  assert.deepEqual((await route(request('GET', '/api/v1/reason-catalogs/1/compact'))).body.labels, [
    ['P03', 'Signed example campaign'],
  ]);
  const base = '/api/v1/causes/israel-palestine/lists/domain/filter/';
  assert.equal((await route(request('GET', base + 'manifest'))).body.cause, 'israel-palestine');
  assert.deepEqual((await route(request('GET', base + 'full'))).body.entries, []);
  assert.equal((await route(request('GET', base + 'delta'))).status, 400);
  assert.equal(
    (await route(request('GET', base + 'delta', { from: '0' }))).body.code,
    'FULL_SYNC_REQUIRED',
  );
  assert.equal((await route(request('GET', '/api/v1/lists/domain/filter/full'))).status, 404);
});
test('public submissions are validated, deduplicated and queued', async () => {
  for (const sourceUrls of [['javascript:alert(1)'], ['file:///secret']])
    assert.equal(
      (
        await route(
          request(
            'POST',
            '/api/v1/submissions',
            {},
            { submissionType: 'add-evidence', narrative: 'Test evidence', sourceUrls },
          ),
        )
      ).status,
      400,
    );
  const input = {
    submissionType: 'add-evidence',
    narrative: 'Documented update',
    proposedReasonCode: 'P03',
    sourceUrls: ['https://example.org/a', 'https://example.org/a'],
  };
  assert.equal((await route(request('POST', '/api/v1/submissions', {}, input))).status, 202);
  assert.equal(
    (
      await route(
        request('POST', '/api/v1/submissions', {}, { ...input, proposedReasonCode: 'P99' }),
      )
    ).status,
    400,
  );
});
