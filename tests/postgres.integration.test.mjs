import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { PostgresPublicEntityDirectory } from '../packages/persistence/dist/index.js';
import {
  FileArtifactStore,
  PgSqlExecutor,
  PostgresPublishedArtifactReader,
  applySqlMigrations,
  publishCurrentState,
} from '../packages/persistence/dist/runtime.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const databaseUrl = process.env.DATABASE_URL;

test(
  'postgres migrations and immutable publication pipeline work end to end',
  { skip: !enabled },
  async () => {
    assert.ok(databaseUrl, 'DATABASE_URL is required when RUN_DB_INTEGRATION=1');
    const db = PgSqlExecutor.create({
      connectionString: databaseUrl,
      maxConnections: 4,
      applicationName: 'isnotreal-integration-test',
    });
    const artifactRoot = await mkdtemp(join(tmpdir(), 'isnotreal-publications-'));

    try {
      const firstMigration = await applySqlMigrations(db, resolve('db/migrations'));
      assert.deepEqual(firstMigration.applied, [
        '0001_core.sql',
        '0002_resolution_and_search.sql',
        '0003_identifier_aliases.sql',
        '0004_publication_provenance.sql',
        '0005_domain_match_scope.sql',
      ]);

      const entity = await db.query(
        `INSERT INTO entities (kind, canonical_name, slug)
         VALUES ('company', 'Example Company', 'example-company')
         RETURNING id::text, public_id::text`,
      );
      const entityId = entity.rows[0].id;
      const publicId = entity.rows[0].public_id;

      const identifier = await db.query(
        `INSERT INTO identifiers (
           kind_code, value, normalized_value, display_value, match_scope, status
         ) VALUES ('domain', 'example.com', 'example.com', 'example.com', 'include-subdomains', 'active')
         RETURNING id::text`,
      );
      const identifierId = identifier.rows[0].id;

      const assertion = await db.query(
        `INSERT INTO assertions (
           primary_entity_id, action_type, summary, occurred_on, date_precision, state
         ) VALUES ($1, 'documented-contract', 'Test-only documented relationship.', '2026-09-15', 'day', 'published')
         RETURNING id::text`,
        [entityId],
      );
      const assertionId = assertion.rows[0].id;

      await db.query(
        `INSERT INTO identifier_assignments (
           identifier_id, entity_id, state, verification_assertion_id
         ) VALUES ($1, $2, 'verified', $3)`,
        [identifierId, entityId, assertionId],
      );

      await db.query(
        `INSERT INTO reason_definitions (code, label, description, category, default_list)
         VALUES
           ('C98', 'Second verified test reason', 'Integration-test reason.', 'company', 'filter'),
           ('C99', 'Verified test reason', 'Integration-test reason.', 'company', 'filter')`,
      );

      const policy = await db.query(
        `INSERT INTO policies (slug, name, description)
         VALUES ('default-filter-policy', 'Default filter policy', 'Integration-test policy.')
         RETURNING id::text`,
      );
      const policyRevision = await db.query(
        `INSERT INTO policy_revisions (policy_id, version, rules, state, effective_at)
         VALUES ($1, 1, '{}'::jsonb, 'active', now())
         RETURNING id::text`,
        [policy.rows[0].id],
      );
      const decision = await db.query(
        `INSERT INTO membership_decisions (
           entity_id, list_kind, decision, state, policy_revision_id, decided_at
         ) VALUES ($1, 'filter', 'include', 'active', $2, now())
         RETURNING id::text`,
        [entityId, policyRevision.rows[0].id],
      );
      const decisionId = decision.rows[0].id;
      await db.query(
        `INSERT INTO membership_decision_reasons (decision_id, reason_code, assertion_id)
         VALUES ($1, 'C99', $2)`,
        [decisionId, assertionId],
      );

      const store = new FileArtifactStore(artifactRoot);
      const firstPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'first',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(firstPublication.activated, true);
      assert.equal(firstPublication.fullArtifactCount, 12);
      assert.equal(firstPublication.deltaArtifactCount, 0);

      const published = new PostgresPublishedArtifactReader(db, store);
      const firstFull = await published.full('domain-subdomains', 'filter');
      assert.deepEqual(firstFull.entries, [['example.com', publicId, ['C99']]]);
      assert.deepEqual((await published.full('domain', 'filter')).entries, []);

      const directory = new PostgresPublicEntityDirectory(db);
      const profile = await directory.byPublicId(publicId);
      assert.equal(profile?.slug, 'example-company');
      assert.deepEqual(profile?.identifiers, [
        {
          kind: 'domain',
          value: 'example.com',
          displayValue: 'example.com',
          matchScope: 'include-subdomains',
        },
      ]);

      await db.query(
        `INSERT INTO membership_decision_reasons (decision_id, reason_code, assertion_id)
         VALUES ($1, 'C98', $2)`,
        [decisionId, assertionId],
      );

      const secondPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'second',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(secondPublication.activated, true);
      assert.equal(secondPublication.fullArtifactCount, 12);
      assert.equal(secondPublication.deltaArtifactCount, 12);

      const delta = await published.delta('domain-subdomains', 'filter', firstPublication.version);
      assert.equal('code' in delta, false);
      assert.deepEqual(delta.added, [['example.com', publicId, ['C98', 'C99']]]);
      assert.deepEqual(delta.removed, []);

      const secondMigration = await applySqlMigrations(db, resolve('db/migrations'));
      assert.deepEqual(secondMigration.applied, []);
      assert.equal(secondMigration.alreadyApplied.length, 5);
    } finally {
      await db.close();
      await rm(artifactRoot, { recursive: true, force: true });
    }
  },
);
