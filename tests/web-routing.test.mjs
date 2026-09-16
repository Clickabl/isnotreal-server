import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicRouteResolver } from '../apps/web/dist/index.js';

const entity = { publicId: '43212', slug: 'macklemore', name: 'Macklemore', kind: 'person', lists: ['highlight'], reasons: [] };
const entities = {
  async byPublicId(id) { return id === '43212' ? entity : null; },
  async bySlug(slug) { return slug === 'macklemore' ? entity : null; },
  async search() { return []; },
};
const alternatives = {
  async list() { return []; },
  async preferred() {
    return {
      entity: { publicId: '99', slug: 'alt', name: 'Alt', kind: 'company', lists: [] },
      relationshipType: 'similar-service', contextKey: 'general', rationale: null,
      destinationUrl: 'https://example.org/', destinationChannel: 'domain',
    };
  },
};

test('numeric public entity URLs resolve to canonical slugs', async () => {
  const resolve = createPublicRouteResolver({ entities, alternatives });
  assert.deepEqual(await resolve('/43212'), { kind: 'redirect', status: 308, location: '/macklemore' });
});

test('go-to-alt uses a temporary redirect to the current approved alternative', async () => {
  const resolve = createPublicRouteResolver({ entities, alternatives });
  assert.deepEqual(await resolve('/go-to-alt/43212'), { kind: 'redirect', status: 302, location: 'https://example.org/' });
});
