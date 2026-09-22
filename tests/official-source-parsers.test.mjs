import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCcfpOctober2023Html } from '../packages/persistence/dist/official-source-parsers.js';

test('CCFP parser extracts signer names only inside the signed list', () => {
  const signers = Array.from(
    { length: 1005 },
    (_, index) => `<p>Person ${index}, Role ${index}, Example Company</p>`,
  ).join('');
  const html = `<!doctype html><html><body><p>Intro person, not a signer</p><h2>SIGNED</h2>${signers}<p><strong>Note – The signers of this statement do so as individuals on their own behalf and not on behalf of their companies or organizations.</strong></p><p>Footer Person, not a signer</p></body></html>`;
  const rows = parseCcfpOctober2023Html(html);
  assert.equal(rows.length, 1005);
  assert.equal(rows[0].rawName, 'Person 0');
  assert.equal(rows.at(-1).rawName, 'Person 1004');
  assert.equal(rows[0].rawPayload.rawLine, 'Person 0, Role 0, Example Company');
});

test('CCFP parser refuses a partial or structurally changed source', () => {
  assert.throws(
    () => parseCcfpOctober2023Html('<html><body>' + '<p>noise</p>'.repeat(600) + '</body></html>'),
    /signer boundaries/,
  );
});
