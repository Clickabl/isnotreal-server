import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('all declared TypeScript workspaces resolve and expose source', async () => {
  const { references } = JSON.parse(await read('tsconfig.json'));
  assert.ok(references.length > 0);
  const names = new Set();
  for (const { path } of references) {
    const pkg = JSON.parse(await read(`${path}/package.json`));
    assert.equal(pkg.private, true);
    assert.equal(names.has(pkg.name), false);
    names.add(pkg.name);
    assert.ok((await read(`${path}/src/index.ts`)).trim());
  }
});

test('production defaults are committed consistently', async () => {
  const config = await read('packages/config/src/index.ts');
  const env = await read('.env.example');
  assert.ok(config.includes("'https://isnotreal.click'"));
  assert.ok(env.includes('API_BASE_URL=https://isnotreal.click/api/v1'));
  assert.ok(env.includes('ENTITY_BASE_URL=https://isnotreal.click'));
  assert.ok(env.includes('ALTERNATIVE_REDIRECT_BASE_URL=https://isnotreal.click/go-to-alt'));
});
