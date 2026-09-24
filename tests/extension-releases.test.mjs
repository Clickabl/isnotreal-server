import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareVersions,
  firefoxUpdateManifest,
  parseExtensionReleases,
} from '../apps/api/dist/extension-releases.js';

test('extension releases validate versions, minimums and https links', () => {
  const releases = parseExtensionReleases({
    browsers: {
      chromium: { latest: '0.2.0', minimum: '0.1.0', url: 'https://chromewebstore.google.com/x' },
      safari: { latest: '0.2.0' },
    },
  });
  assert.deepEqual(releases.browsers.safari, { latest: '0.2.0', minimum: '0.2.0' });
  assert.throws(
    () => parseExtensionReleases({ browsers: { chromium: { latest: '1.0', minimum: '2.0' } } }),
    /above latest/,
  );
  assert.throws(
    () => parseExtensionReleases({ browsers: { edge: { latest: '1.0' } } }),
    /unknown browser/,
  );
  assert.throws(
    () =>
      parseExtensionReleases({ browsers: { firefox: { latest: '1.0', url: 'http://x.test/' } } }),
    /https/,
  );
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('firefox self-distribution becomes a Firefox update manifest', () => {
  const hash = 'a'.repeat(64);
  const { firefoxSelfDistribution } = parseExtensionReleases({
    browsers: {},
    firefoxSelfDistribution: {
      geckoId: 'extension@isnotreal.click',
      updates: [{ version: '0.2.0', link: 'https://isnotreal.click/x.xpi', sha256: hash }],
    },
  });
  assert.deepEqual(firefoxUpdateManifest(firefoxSelfDistribution), {
    addons: {
      'extension@isnotreal.click': {
        updates: [
          {
            version: '0.2.0',
            update_link: 'https://isnotreal.click/x.xpi',
            update_hash: `sha256:${hash}`,
          },
        ],
      },
    },
  });
});
