import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicWebsite } from '../apps/web/dist/index.js';
const entity = {
  publicId: '42',
  slug: 'example',
  name: '<script>alert(1)</script>',
  kind: 'person',
  lists: [],
  identifiers: [],
  relationships: [],
  reasons: [
    {
      code: 'P03',
      label: 'Example reason',
      description: 'Reason description',
      assertions: [
        {
          summary: 'A documented fact',
          occurredOn: '2026-09-20',
          sources: [
            {
              url: 'javascript:alert(1)',
              title: 'Unsafe',
              publisher: null,
              retrievedAt: '2026-09-20',
              primary: false,
            },
          ],
        },
      ],
    },
  ],
};
const entities = {
  async byPublicId(id) {
    return id === '42' ? entity : null;
  },
  async bySlug(slug) {
    return slug === 'example' ? entity : null;
  },
  async search() {
    return [entity];
  },
};
const web = createPublicWebsite({
  entities,
  alternatives: {
    async list() {
      return [];
    },
    async preferred() {
      return null;
    },
  },
});
test('real public pages and static assets render without fabricated downloads', async () => {
  for (const path of [
    '/',
    '/download',
    '/privacy',
    '/how-it-works',
    '/causes',
    '/search',
    '/report',
  ]) {
    const r = await web(path);
    assert.equal(r.kind, 'html', path);
    assert.equal(r.status, 200, path);
  }
  assert.match((await web('/download')).html, /Store release not yet published/);
  assert.equal((await web('/assets/site.css')).contentType, 'text/css; charset=utf-8');
  assert.match((await web('/report')).html, /data-submission/);
});
test('canonical numeric URLs and no-alternative state remain usable', async () => {
  assert.deepEqual(await web('/42'), { kind: 'redirect', status: 308, location: '/example' });
  assert.deepEqual(await web('/42/alternatives'), {
    kind: 'redirect',
    status: 308,
    location: '/example/alternatives',
  });
  assert.deepEqual(await web('/go-to-alt/42'), {
    kind: 'redirect',
    status: 302,
    location: '/example/alternatives',
  });
  assert.equal((await web('/999')).status, 404);
});
test('entity evidence escapes HTML and refuses unsafe source schemes', async () => {
  const r = await web('/example');
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /A documented fact/);
  assert.doesNotMatch(r.html, /<script>alert|href="javascript:/);
});
