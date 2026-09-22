import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL } from 'node:url';
const { fetch, console } = globalThis;
import assert from 'node:assert/strict';
import { verify, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalJson } from '../packages/protocol/dist/index.js';
import {
  PgSqlExecutor,
  applySqlMigrations,
  PostgresPublishedArtifactReader,
  publishCurrentState,
} from '../packages/persistence/dist/runtime.js';
import { publishReasonCatalogVersion } from '../packages/persistence/dist/reason-catalog.js';
import { startNodeApiRuntime } from '../apps/api/dist/runtime.js';

export async function runDeliveryChecks({
  db,
  store,
  artifactRoot,
  databaseUrl,
  signing,
  publicKey,
  entityId,
  publicId,
  assertionId,
  policyRevisionId,
}) {
  const reader = new PostgresPublishedArtifactReader(db, store);
  const additionalReasons = await db.query(
    `SELECT cause.slug, pref.reason_code, pref.suggested_action, requirement.public_criteria, requirement.exclusion_criteria
     FROM cause_reason_preferences pref
     JOIN causes cause ON cause.id = pref.cause_id
     JOIN reason_evidence_requirements requirement ON requirement.reason_code = pref.reason_code
     WHERE cause.slug IN ('epstein-records', 'trump-maga', 'russia-ukraine')`,
  );
  for (const code of ['EP01', 'MAGA01', 'RU01'])
    assert.ok(additionalReasons.rows.some((row) => row.reason_code === code), code);
  assert.equal(
    additionalReasons.rows.every((row) => row.suggested_action === 'informational'),
    true,
  );
  const catalogReasons = await db.query(
    `SELECT code FROM current_reason_catalog WHERE code IN ('EP01','MAGA01','RU01') ORDER BY code`,
  );
  assert.deepEqual(catalogReasons.rows.map((row) => row.code), ['EP01', 'MAGA01', 'RU01']);
  assert.match(
    additionalReasons.rows.find((row) => row.reason_code === 'EP01').exclusion_criteria,
    /victims|minors/i,
  );
  assert.match(
    additionalReasons.rows.find((row) => row.reason_code === 'MAGA01').exclusion_criteria,
    /Do not infer endorsement/i,
  );
  assert.match(
    additionalReasons.rows.find((row) => row.reason_code === 'RU01').public_criteria,
    /official sanctions list/i,
  );
  const cause = 'israel-palestine';
  const manifest = await reader.manifest(cause, 'domain-subdomains', 'filter');
  const { signature, ...unsigned } = manifest;
  assert.equal(signature.keyId, signing.keyId);
  assert.equal(
    verify(
      null,
      Buffer.from(canonicalJson(unsigned)),
      publicKey,
      Buffer.from(signature.value, 'base64'),
    ),
    true,
  );
  assert.equal(
    verify(
      null,
      Buffer.from(canonicalJson({ ...unsigned, cause: 'russia-ukraine' })),
      publicKey,
      Buffer.from(signature.value, 'base64'),
    ),
    false,
  );
  const bytes = await store.get(manifest.full.url.slice('/data/'.length));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.full.sha256);
  assert.equal(bytes.length, manifest.full.byteSize);
  const dict = await store.get(manifest.dictionary.url.slice('/data/'.length));
  assert.equal(createHash('sha256').update(dict).digest('hex'), manifest.dictionary.sha256);
  assert.equal(JSON.parse(dict).catalogVersion, manifest.reasonCatalogVersion);
  await assert.rejects(
    publishCurrentState(db, store, { cause, compilerVersion: 'test', sourceRevision: 'unsigned' }),
    /signing key/,
  );
  const c = await db.query(
    `INSERT INTO causes(slug,name,description) VALUES('test-isolation','Synthetic test cause','Test only') RETURNING id::text`,
  );
  const otherId = c.rows[0].id;
  await db.query(`INSERT INTO reason_definitions
    (code,label,description,category,default_list,publication_enabled)
    SELECT 'Q01','Synthetic second-cause fact','Test fixture only',category,default_list,true
    FROM reason_definitions WHERE code='C03'`);
  await db.query(`INSERT INTO reason_evidence_requirements
    (reason_code,subject_scope,evidence_mode,validity_mode,public_criteria,exclusion_criteria,
     primary_or_authoritative_required,minimum_evidence_items,reverify_after_days,inheritance_policy)
    SELECT 'Q01',subject_scope,evidence_mode,validity_mode,public_criteria,exclusion_criteria,
     primary_or_authoritative_required,minimum_evidence_items,reverify_after_days,inheritance_policy
    FROM reason_evidence_requirements WHERE reason_code='C03'`);
  await db.query("INSERT INTO reason_causes(reason_code,cause_id) VALUES('Q01',$1)", [otherId]);
  await publishReasonCatalogVersion(db, { notes: 'Synthetic two-cause isolation fixture' });
  await db.query("INSERT INTO assertion_reasons(assertion_id,reason_code) VALUES($1,'Q01')", [
    assertionId,
  ]);
  const decision = await db.query(
    `INSERT INTO membership_decisions(entity_id,cause_id,list_kind,decision,state,policy_revision_id,decided_at) VALUES($1,$2,'filter','include','active',$3,now()) RETURNING id::text`,
    [entityId, otherId, policyRevisionId],
  );
  await db.query(
    `INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id) VALUES($1,'Q01',$2)`,
    [decision.rows[0].id, assertionId],
  );
  const other = await publishCurrentState(db, store, {
    cause: 'test-isolation',
    compilerVersion: 'test',
    sourceRevision: 'isolation',
    signing,
  });
  assert.equal(
    (await reader.manifest(cause, 'domain-subdomains', 'filter')).version,
    manifest.version,
  );
  assert.equal(
    (await reader.manifest('test-isolation', 'domain-subdomains', 'filter')).version,
    other.version,
  );
  const otherFull = await reader.full('test-isolation', 'domain-subdomains', 'filter');
  assert.deepEqual(otherFull.entries, [['example.com', publicId, ['Q01']]]);
  const firstFull = await reader.full(cause, 'domain-subdomains', 'filter');
  assert.ok(firstFull.entries.every((entry) => !entry[2].includes('Q01')));
  const next = await publishCurrentState(db, store, {
    cause,
    compilerVersion: 'test',
    sourceRevision: 'next',
    signing,
  });
  assert.equal(
    (await reader.manifest('test-isolation', 'domain-subdomains', 'filter')).version,
    other.version,
  );
  assert.equal((await reader.manifest(cause, 'domain-subdomains', 'filter')).version, next.version);
  // Context-only or contradictory sources never satisfy supporting evidence counts.
  await db.query("UPDATE assertion_source_links SET stance='context' WHERE assertion_id=$1", [
    assertionId,
  ]);
  const gate = await db.query(
    'SELECT valid_for_publication,issues FROM membership_reason_validation WHERE decision_id=$1',
    [decision.rows[0].id],
  );
  assert.equal(gate.rows[0].valid_for_publication, false);
  assert.ok(gate.rows[0].issues.includes('insufficient-sources'));
  await db.query("UPDATE assertion_source_links SET stance='supports' WHERE assertion_id=$1", [
    assertionId,
  ]);
  await db.query(
    "UPDATE membership_decision_reasons SET last_verified_at=now()-interval '181 days' WHERE decision_id=$1",
    [decision.rows[0].id],
  );
  assert.equal(
    (
      await db.query(
        'SELECT valid_for_publication FROM membership_reason_validation WHERE decision_id=$1',
        [decision.rows[0].id],
      )
    ).rows[0].valid_for_publication,
    false,
  );
  await db.query(
    'UPDATE membership_decision_reasons SET last_verified_at=now() WHERE decision_id=$1',
    [decision.rows[0].id],
  );
  const runtime = await startNodeApiRuntime({ databaseUrl, artifactRoot, port: 0 });
  const origin = `http://127.0.0.1:${runtime.port}`;
  try {
    for (const path of [
      '/healthz',
      '/readyz',
      '/',
      '/download',
      '/causes',
      '/causes/israel-palestine',
      '/privacy',
      '/search?q=Example',
      '/report',
      '/example-company',
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
    }
    const numeric = await fetch(origin + '/' + publicId, { redirect: 'manual' });
    assert.equal(numeric.status, 308);
    assert.equal(numeric.headers.get('location'), '/example-company');
    const css = await fetch(origin + '/assets/site.css');
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.ok((await css.text()).includes('--accent'));
    assert.equal(
      (
        await fetch(origin + '/assets/site.css', {
          headers: { 'If-None-Match': css.headers.get('etag') },
        })
      ).status,
      304,
    );
    const head = await fetch(origin + '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.doesNotMatch(head.headers.get('content-security-policy'), /unsafe-inline/);
    const admin = await fetch(origin + '/admin/api/v1/submissions');
    assert.equal(admin.status, 404);
    assert.equal(admin.headers.get('access-control-allow-origin'), null);
    assert.equal(
      (await fetch(origin + '/api/v1/causes/epstein-records/lists/domain/filter/manifest')).status,
      503,
    );
    const raw = await fetch(origin + manifest.full.url);
    assert.equal(raw.status, 200);
    assert.match(raw.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(origin + '/data/not-a-publication.json')).status, 404);
    const submitted = await fetch(origin + '/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionType: 'incorrect-information',
        narrative: 'Integration correction fixture',
        sourceUrls: ['https://example.org/source'],
      }),
    });
    assert.equal(submitted.status, 202);
    assert.ok((await submitted.json()).id);
  } finally {
    await runtime.close();
  }
  await checkOps(databaseUrl);
  console.log(
    'DELIVERY VERIFIED: cause isolation, signatures, supporting evidence, HTTP pages/assets/forms, and restricted runtime grants',
  );
}

async function checkOps(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Ops tests require a disposable loopback _test database');
  for (const file of [
    'db-bootstrap',
    'db-grants',
    'db-shell',
    'server-doctor',
    'backup-db',
    'restore-db',
  ]) {
    const syntax = spawnSync('bash', ['-n', `ops/${file}.sh`], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  const suffix = String(process.pid),
    dbName = `isnotreal_ops_test_${suffix}`;
  const owner = `inr_owner_${suffix}`,
    app = `inr_app_${suffix}`,
    editor = `inr_editor_${suffix}`;
  const passwords = [
    randomBytes(24).toString('hex'),
    randomBytes(24).toString('hex'),
    randomBytes(24).toString('hex'),
  ];
  const env = {
    ...process.env,
    PG_ADMIN_URL: databaseUrl,
    ISNOTREAL_DB_NAME: dbName,
    ISNOTREAL_OWNER_ROLE: owner,
    ISNOTREAL_APP_ROLE: app,
    ISNOTREAL_EDITOR_ROLE: editor,
    ISNOTREAL_OWNER_PASSWORD: passwords[0],
    ISNOTREAL_APP_PASSWORD: passwords[1],
    ISNOTREAL_EDITOR_PASSWORD: passwords[2],
  };
  const run = (file, extra = {}, args = []) => {
    const result = spawnSync('bash', [`ops/${file}.sh`, ...args], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const admin = PgSqlExecutor.create({ connectionString: databaseUrl });
  let ownerDb, appDb;
  const target = new URL(databaseUrl);
  target.pathname = '/' + dbName;
  try {
    run('db-bootstrap');
    run('db-bootstrap');
    const ownerUrl = new URL(target);
    ownerUrl.username = owner;
    ownerUrl.password = passwords[0];
    ownerDb = PgSqlExecutor.create({ connectionString: ownerUrl.href });
    await applySqlMigrations(ownerDb, 'db/migrations');
    run('db-grants', { PG_ADMIN_DB_URL: target.href });
    const appUrl = new URL(target);
    appUrl.username = app;
    appUrl.password = passwords[1];
    appDb = PgSqlExecutor.create({ connectionString: appUrl.href });
    await appDb.query('SELECT count(*) FROM entities');
    await assert.rejects(
      appDb.query("UPDATE reason_definitions SET label='Not allowed' WHERE code='P03'"),
      /permission denied/,
    );
    await assert.rejects(appDb.query('DELETE FROM review_events'), /permission denied/);
    await assert.rejects(appDb.query('CREATE TABLE forbidden(id int)'), /permission denied/);
    const inserted = await appDb.query(
      `INSERT INTO community_submissions(submission_type,narrative) VALUES('add-evidence','Test submission') RETURNING id::text,submitted_at`,
    );
    assert.ok(inserted.rows[0].id);
    const backupDir = await mkdtemp(join(tmpdir(), 'inr-backup-test-'));
    try {
      const file = run('backup-db', { DATABASE_URL: ownerUrl.href, BACKUP_DIR: backupDir });
      assert.ok(file.endsWith('.dump'));
    } finally {
      await rm(backupDir, { recursive: true, force: true });
    }
  } finally {
    await appDb?.close();
    await ownerDb?.close();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    for (const role of [app, editor, owner]) await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.close();
  }
}

// Additional cause catalog migrations are covered by the PostgreSQL integration migration-count gate.
