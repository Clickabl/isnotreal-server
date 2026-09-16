import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRouter } from '../apps/api/dist/index.js';

const profile = {
  publicId: '42',
  slug: 'example',
  name: 'Example',
  kind: 'person',
  lists: ['highlight'],
  reasons: [],
};
const entities = {
  async byPublicId(id) {
    return id === '42' ? profile : null;
  },
  async bySlug(slug) {
    return slug === 'example' ? profile : null;
  },
  async search() {
    return [profile];
  },
};
const alternatives = {
  async list() {
    return [];
  },
  async preferred() {
    return null;
  },
};
const submissions = {
  async create() {
    return { id: 'submission-1', submittedAt: '2026-09-15T00:00:00Z', state: 'pending' };
  },
};
const publications = {
  async manifest(channel, list) {
    return {
      schemaVersion: 2,
      channel,
      list,
      version: '1',
      generatedAt: '2026-09-15T00:00:00Z',
      expiresAt: '2026-09-16T00:00:00Z',
    };
  },
  async full(channel, list) {
    return { ...(await this.manifest(channel, list)), entries: [] };
  },
  async delta(channel, list) {
    return { schemaVersion: 2, code: 'FULL_SYNC_REQUIRED', channel, list, currentVersion: '1' };
  },
};
const route = createApiRouter({ entities, alternatives, submissions, publications });
const request = (method, pathname, query = {}, body = null) => ({ method, pathname, query, body });

test('entity and list endpoints expose the new public contracts', async () => {
  assert.equal((await route(request('GET', '/api/v1/entities/42'))).status, 200);
  const manifest = await route(request('GET', '/api/v1/lists/domain/filter/manifest'));
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.channel, 'domain');
});

test('community submission endpoint validates before enqueueing', async () => {
  const invalid = await route(
    request('POST', '/api/v1/submissions', {}, { submissionType: 'wat' }),
  );
  assert.equal(invalid.status, 400);
  const accepted = await route(
    request(
      'POST',
      '/api/v1/submissions',
      {},
      {
        submissionType: 'add-evidence',
        narrative: 'Documented update',
        sourceUrls: ['https://example.org/source'],
      },
    ),
  );
  assert.equal(accepted.status, 202);
});
