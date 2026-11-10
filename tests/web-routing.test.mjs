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
    '/terms',
    '/admin-console',
  ]) {
    const r = await web(path);
    assert.equal(r.kind, 'html', path);
    assert.equal(r.status, 200, path);
  }
  const download = await web('/download');
  assert.match(download.html, /Store release not yet published/);
  assert.match(download.html, /data-platform="chromium"/);
  assert.match(download.html, /data-platform="firefox"/);
  assert.match(download.html, /data-platform="safari"/);
  assert.equal((await web('/assets/site.css')).contentType, 'text/css; charset=utf-8');
  assert.equal((await web('/assets/admin.js')).contentType, 'text/javascript; charset=utf-8');
  const report = await web('/report');
  assert.match(report.html, /data-submission/);
  assert.match(report.html, /product-feedback/);
  assert.match(report.html, /accessibility-feedback/);
  assert.match(report.html, /abuse-report/);
  const admin = await web('/admin-console');
  assert.match(admin.html, /Restricted editor surface/);
  assert.doesNotMatch(admin.html, /Bearer [A-Za-z0-9._-]+/);
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

const cause = (listedIdentifiers) => ({
  slug: 'example-cause',
  name: 'Example cause',
  description: 'Example description',
  reasons: [{ code: 'P03', label: 'Example reason', description: 'Reason description' }],
  coverage: {
    state: 'available',
    channels: ['domain'],
    generatedAt: '2026-11-10T00:00:00Z',
    expiresAt: '2026-11-12T00:00:00Z',
    listedIdentifiers,
  },
});
const withCause = (c) =>
  createPublicWebsite({
    entities,
    alternatives: {
      async list() {
        return [];
      },
      async preferred() {
        return null;
      },
    },
    causes: {
      async list() {
        return [c];
      },
      async bySlug(slug) {
        return slug === c.slug ? c : null;
      },
    },
  });
test('an empty published list is never presented as coverage', async () => {
  const empty = withCause(cause(0));
  assert.match((await empty('/')).html, /1 reason definition · no records published yet/);
  assert.doesNotMatch((await empty('/')).html, /published coverage/);
  assert.match(
    (await empty('/causes/example-cause')).html,
    /No records are published for this cause yet/,
  );
  const listed = withCause(cause(1234));
  assert.match((await listed('/')).html, /1,234 listed accounts and sites/);
  assert.doesNotMatch(
    (await listed('/causes/example-cause')).html,
    /No records are published for this cause yet/,
  );
});
test('legal pages, sitemap and robots are linked for launch', async () => {
  const home = await web('/');
  assert.match(home.html, /href="\/terms"/);
  assert.match((await web('/terms')).html, /A listing is not an accusation/);
  assert.doesNotMatch((await web('/privacy')).html, /before public launch/);
  assert.doesNotMatch((await web('/download')).html, /companion repository|npm run package/);
  const sitemap = await withCause(cause(0))('/sitemap.xml');
  assert.equal(sitemap.contentType, 'application/xml; charset=utf-8');
  assert.match(sitemap.body, /<loc>https:\/\/isnotreal\.click\/terms<\/loc>/);
  assert.match(sitemap.body, /<loc>https:\/\/isnotreal\.click\/causes\/example-cause<\/loc>/);
  assert.match(
    (await web('/robots.txt')).body,
    /Sitemap: https:\/\/isnotreal\.click\/sitemap\.xml/,
  );
});
