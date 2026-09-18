import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRouter } from '../apps/api/dist/index.js';

const profile = {
  publicId: '42',
  slug: 'example',
  name: 'Example',
  kind: 'person',
  lists: ['highlight'],
  identifiers: [],
  relationships: [],
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
const reasonEntry = {
  code: 'P03',
  label: 'Signed example campaign',
  description: 'Documented campaign signature.',
  category: 'campaign',
  defaultList: 'highlight',
  publicationEnabled: true,
  evidenceRequirement: {
    subjectScope: 'person',
    evidenceMode: 'named-campaign-membership',
    validityMode: 'historical-event',
    publicCriteria: 'Official campaign record.',
    exclusionCriteria: '',
    primaryOrAuthoritativeRequired: true,
    minimumEvidenceItems: 1,
    reverifyAfterDays: null,
    inheritancePolicy: 'none',
  },
  campaigns: [],
  authoritySources: [],
};
const reasons = {
  async version() {
    return 1;
  },
  async list() {
    return [reasonEntry];
  },
  async byCode(code) {
    return code === 'P03' ? reasonEntry : null;
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
      schemaVersion: 4,
      channel,
      list,
      version: '1',
      reasonCatalogVersion: 1,
      generatedAt: '2026-09-15T00:00:00Z',
      expiresAt: '2026-09-16T00:00:00Z',
    };
  },
  async full(channel, list) {
    return { ...(await this.manifest(channel, list)), entries: [] };
  },
  async delta(channel, list) {
    return {
      schemaVersion: 4,
      code: 'FULL_SYNC_REQUIRED',
      channel,
      list,
      currentVersion: '1',
      currentReasonCatalogVersion: 1,
    };
  },
};
const route = createApiRouter({ entities, reasons, alternatives, submissions, publications });
const request = (method, pathname, query = {}, body = null) => ({ method, pathname, query, body });

test('entity, reason and list endpoints expose the public contracts', async () => {
  assert.equal((await route(request('GET', '/api/v1/entities/42'))).status, 200);
  assert.equal((await route(request('GET', '/api/v1/entities/slug/example'))).status, 200);
  const reasonCatalog = await route(request('GET', '/api/v1/reasons'));
  assert.equal(reasonCatalog.status, 200);
  assert.equal(reasonCatalog.body.catalogVersion, 1);
  assert.equal(reasonCatalog.body.reasons[0].code, 'P03');
  const compactReasons = await route(request('GET', '/api/v1/reasons/compact'));
  assert.equal(compactReasons.status, 200);
  assert.equal(compactReasons.body.catalogVersion, 1);
  assert.deepEqual(compactReasons.body.labels, [['P03', 'Signed example campaign']]);
  const reasonDetail = await route(request('GET', '/api/v1/reasons/P03'));
  assert.equal(reasonDetail.status, 200);
  assert.equal(
    reasonDetail.body.reason.evidenceRequirement.evidenceMode,
    'named-campaign-membership',
  );
  assert.equal((await route(request('GET', '/api/v1/reasons/P99'))).status, 404);
  const historicalCatalog = await route(request('GET', '/api/v1/reason-catalogs/1/compact'));
  assert.equal(historicalCatalog.status, 200);
  assert.equal(historicalCatalog.body.catalogVersion, 1);
  assert.equal(
    (await route(request('GET', '/api/v1/reason-catalogs/999/compact'))).status,
    404,
  );
  assert.equal((await route(request('GET', '/api/v1/reasons', { version: 'wat' }))).status, 400);
  const manifest = await route(request('GET', '/api/v1/lists/domain/filter/manifest'));
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.channel, 'domain');
  const subtreeManifest = await route(
    request('GET', '/api/v1/lists/domain-subdomains/filter/manifest'),
  );
  assert.equal(subtreeManifest.status, 200);
  assert.equal(subtreeManifest.body.channel, 'domain-subdomains');
});

test('community submission endpoint validates before enqueueing', async () => {
  const invalid = await route(
    request('POST', '/api/v1/submissions', {}, { submissionType: 'wat' }),
  );
  assert.equal(invalid.status, 400);
  const unsafeSource = await route(
    request(
      'POST',
      '/api/v1/submissions',
      {},
      {
        submissionType: 'add-evidence',
        narrative: 'Documented update',
        sourceUrls: ['file:///etc/passwd'],
      },
    ),
  );
  assert.equal(unsafeSource.status, 400);
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
