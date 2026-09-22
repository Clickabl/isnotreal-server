const { fetch } = globalThis;
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresSubmissionWriter } from '../packages/persistence/dist/index.js';
import { PostgresFeedbackInbox } from '../packages/persistence/dist/feedback-inbox.js';
import { submissionCatalog } from '../packages/application/dist/index.js';
import { startNodeApiRuntime } from '../apps/api/dist/runtime.js';

export async function runFeedbackChecks({ db, databaseUrl, artifactRoot }) {
  const writer = new PostgresSubmissionWriter(db),
    inbox = new PostgresFeedbackInbox(db);
  const base = {
    entityPublicId: null,
    identifierKind: null,
    identifierValue: null,
    proposedList: null,
    proposedReasonCode: null,
    narrative: 'Synthetic quality-pass report.',
    sourceUrls: [],
    submitterContactRef: null,
  };
  for (const category of submissionCatalog) {
    const receipt = await writer.create({
      ...base,
      submissionType: category.code,
      clientRequestId: randomUUID(),
    });
    const row = (
      await db.query('SELECT queue FROM community_submissions WHERE id=$1', [receipt.id])
    ).rows[0];
    assert.equal(row.queue, category.queue);
  }
  const input = {
    ...base,
    submissionType: 'bug-report',
    clientRequestId: randomUUID(),
    sourceUrls: ['https://example.com/test'],
  };
  const [first, retry] = await Promise.all([writer.create(input), writer.create(input)]);
  assert.equal(first.id, retry.id);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::integer AS count FROM submission_sources WHERE submission_id=$1',
        [first.id],
      )
    ).rows[0].count,
    1,
  );
  await assert.rejects(
    writer.create({ ...input, narrative: 'Different content with reused key.' }),
    /different content/,
  );
  await assert.rejects(
    writer.create({ ...base, submissionType: 'bug-report', entityPublicId: '9223372036854775807' }),
    /no longer exists/,
  );
  const page = await inbox.list({ queue: 'product', limit: 2, state: 'open' });
  assert.equal(page.reports.length, 2);
  assert.ok(page.next);
  const second = await inbox.list({ queue: 'product', limit: 2, state: 'open', after: page.next });
  assert.ok(second.reports.every((row) => !page.reports.some((prior) => prior.id === row.id)));
  const reviewed = await inbox.review(
    first.id,
    { state: 'triaged', expectedRevision: 0, note: 'Investigating.' },
    'quality-editor',
  );
  assert.equal(reviewed.revision, 1);
  await assert.rejects(
    inbox.review(
      first.id,
      { state: 'accepted', expectedRevision: 0, note: 'Stale decision.' },
      'other-editor',
    ),
    /changed/,
  );
  await assert.rejects(
    inbox.review(first.id, { state: 'spam', expectedRevision: 1, note: '' }, 'quality-editor'),
    /Explain/,
  );
  await inbox.review(
    first.id,
    { state: 'accepted', expectedRevision: 1, note: 'Confirmed product issue.' },
    'quality-editor',
  );
  const duplicate = await writer.create({ ...input, clientRequestId: randomUUID() });
  assert.ok((await inbox.duplicates(duplicate.id)).some((row) => row.id === first.id));
  await inbox.review(
    duplicate.id,
    {
      state: 'duplicate',
      expectedRevision: 0,
      note: 'Same report content.',
      duplicateOf: first.id,
    },
    'quality-editor',
  );
  const runtime = await startNodeApiRuntime({ databaseUrl, artifactRoot, port: 0 });
  const origin = 'http://127.0.0.1:' + runtime.port;
  try {
    for (const path of [
      '/report',
      '/editor',
      '/help',
      '/assets/feedback.js',
      '/assets/editor.js',
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      if (path === '/editor' || path === '/report')
        assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const response = await fetch(origin + '/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).id, first.id);
    const bad = await fetch(origin + '/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, sourceUrls: ['https://user:password@example.com'] }),
    });
    assert.equal(bad.status, 400);
    const cross = await fetch(origin + '/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify(input),
    });
    assert.equal(cross.status, 403);
    const metrics = await fetch(origin + '/admin/api/v1/metrics');
    assert.equal(metrics.status, 404);
  } finally {
    await runtime.close();
  }
}
