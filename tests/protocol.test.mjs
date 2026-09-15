import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
test('public wire interfaces allow only IDs and synchronization fields', async () => {
  const source = await readFile(
    new URL('../packages/protocol/src/index.ts', import.meta.url),
    'utf8',
  );
  const ast = ts.createSourceFile('protocol.ts', source, ts.ScriptTarget.Latest, true);
  const allowed = new Set([
    'platform',
    'accountId',
    'schemaVersion',
    'version',
    'ids',
    'fromVersion',
    'toVersion',
    'added',
    'removed',
    'code',
    'currentVersion',
  ]);
  const interfaces = ast.statements.filter(ts.isInterfaceDeclaration);
  assert.equal(interfaces.length, 5);
  for (const declaration of interfaces) {
    for (const member of declaration.members) {
      assert.ok(
        ts.isPropertySignature(member),
        'wire contracts cannot contain index signatures or methods',
      );
      assert.ok(
        allowed.has(member.name.getText(ast)),
        `unexpected public field ${member.name.getText(ast)}`,
      );
    }
  }
  assert.equal(
    ast.statements.filter(ts.isImportDeclaration).length,
    0,
    'public contracts must not import domain data',
  );
});
