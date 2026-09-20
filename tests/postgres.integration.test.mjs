import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  PostgresPublicEntityDirectory,
  PostgresReasonCatalogReader,
} from '../packages/persistence/dist/index.js';
import {
  approveCampaignImportRow,
  commitCampaignImport,
  markCampaignImportReady,
  markCampaignImportRow,
  stageAuthorityImport,
  stageCampaignImport,
} from '../packages/persistence/dist/campaign-import.js';
import {
  approveMembershipProposal,
  listMembershipProposals,
} from '../packages/persistence/dist/membership-review.js';
import { publishReasonCatalogVersion } from '../packages/persistence/dist/reason-catalog.js';
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
        '0006_official_reason_catalog_v1.sql',
        '0007_reason_evidence_rules_and_official_sources.sql',
        '0008_reason_catalog_versioning_and_freshness.sql',
        '0009_membership_reason_validation.sql',
        '0010_publication_reason_catalog_version.sql',
        '0011_freeze_reason_bindings_and_disable_unscoped_finance.sql',
        '0012_protect_published_reason_catalogs.sql',
        '0013_reason_definition_publication_policy.sql',
        '0014_campaign_import_staging.sql',
        '0015_enforce_reason_alignment.sql',
        '0016_source_capture_http_metadata.sql',
        '0017_refresh_bds_authority_registry.sql',
        '0018_generalize_official_list_imports.sql',
        '0019_membership_proposals_and_review.sql',
        '0020_causes.sql',
        '0021_cause_scoped_publication_candidates.sql',
        '0022_cause_reason_preferences.sql',
        '0023_public_cause_catalog.sql',
        '0024_cause_scoped_artifacts.sql',
      ]);

      const reasonCatalog = new PostgresReasonCatalogReader(db);
      assert.equal(await reasonCatalog.version(), 1);
      const catalog = await reasonCatalog.list();
      assert.equal(catalog.length, 60);
      const artists4Ceasefire = catalog.find((reason) => reason.code === 'P03');
      assert.equal(artists4Ceasefire?.campaigns[0]?.slug, 'artists4ceasefire');
      assert.equal(
        artists4Ceasefire?.evidenceRequirement?.evidenceMode,
        'named-campaign-membership',
      );
      assert.equal(artists4Ceasefire?.authoritySources.length, 1);

      const organicBds = catalog.find((reason) => reason.code === 'C25');
      assert.equal(organicBds?.label, 'BDS organic boycott target');
      assert.equal(organicBds?.evidenceRequirement?.validityMode, 'current-list-membership');
      assert.equal(organicBds?.evidenceRequirement?.reverifyAfterDays, 90);
      assert.equal(catalog.find((reason) => reason.code === 'C19')?.publicationEnabled, false);
      assert.equal(catalog.find((reason) => reason.code === 'C20')?.publicationEnabled, false);
      assert.equal(catalog.find((reason) => reason.code === 'C03')?.publicationEnabled, true);
      assert.equal((await reasonCatalog.list(999)).length, 0);
      assert.equal((await reasonCatalog.byCode('P03', 1))?.code, 'P03');

      await assert.rejects(
        db.query(
          `UPDATE reason_catalog_entries
           SET label = 'Mutated label'
           WHERE reason_code = 'P03'`,
        ),
        /immutable once catalog leaves draft state/,
      );

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

      const sourceDocument = await db.query(
        `INSERT INTO source_documents (
           canonical_url, title, publisher, source_type
         ) VALUES (
           'https://example.org/test-contract',
           'Integration test contract record',
           'Example Registry',
           'filing'
         )
         RETURNING id::text`,
      );
      const sourceCapture = await db.query(
        `INSERT INTO source_captures (
           document_id, retrieved_at, capture_method, status
         ) VALUES ($1, now(), 'manual', 'available')
         RETURNING id::text`,
        [sourceDocument.rows[0].id],
      );
      await db.query(
        `INSERT INTO assertion_source_links (
           assertion_id, capture_id, is_primary, stance
         ) VALUES ($1, $2, true, 'supports')`,
        [assertionId, sourceCapture.rows[0].id],
      );

      await db.query(
        `INSERT INTO identifier_assignments (
           identifier_id, entity_id, state, verification_assertion_id
         ) VALUES ($1, $2, 'verified', $3)`,
        [identifierId, entityId, assertionId],
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
        `INSERT INTO assertion_reasons (assertion_id, reason_code)
         VALUES ($1, 'C03')`,
        [assertionId],
      );
      await db.query(
        `INSERT INTO membership_decision_reasons (decision_id, reason_code, assertion_id)
         VALUES ($1, 'C03', $2)`,
        [decisionId, assertionId],
      );

      const unsourcedAssertion = await db.query(
        `INSERT INTO assertions (
           primary_entity_id, action_type, summary, occurred_on, date_precision, state
         ) VALUES ($1, 'unverified-test-claim', 'Intentionally unsourced test claim.', '2026-09-15', 'day', 'published')
         RETURNING id::text`,
        [entityId],
      );
      await db.query(
        `INSERT INTO assertion_reasons (assertion_id, reason_code)
         VALUES ($1, 'C01')`,
        [unsourcedAssertion.rows[0].id],
      );
      await db.query(
        `INSERT INTO membership_decision_reasons (decision_id, reason_code, assertion_id)
         VALUES ($1, 'C01', $2)`,
        [decisionId, unsourcedAssertion.rows[0].id],
      );
      const invalidReason = await db.query(
        `SELECT valid_for_publication, issues
         FROM membership_reason_validation
         WHERE decision_id = $1 AND reason_code = 'C01'`,
        [decisionId],
      );
      assert.equal(invalidReason.rows[0].valid_for_publication, false);
      assert.ok(invalidReason.rows[0].issues.includes('insufficient-sources'));

      const store = new FileArtifactStore(artifactRoot);
      const firstPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'first',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(firstPublication.activated, true);
      assert.equal(firstPublication.fullArtifactCount, 48);
      assert.equal(firstPublication.deltaArtifactCount, 0);

      const published = new PostgresPublishedArtifactReader(db, store);
      const firstFull = await published.full('israel-palestine', 'domain-subdomains', 'filter');
      assert.equal(firstFull.reasonCatalogVersion, 1);
      assert.deepEqual(firstFull.entries, [['example.com', publicId, ['C03']]]);
      assert.deepEqual((await published.full('israel-palestine', 'domain', 'filter')).entries, []);

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
        `INSERT INTO assertion_reasons (assertion_id, reason_code)
         VALUES ($1, 'C05')`,
        [assertionId],
      );
      await db.query(
        `INSERT INTO membership_decision_reasons (decision_id, reason_code, assertion_id)
         VALUES ($1, 'C05', $2)`,
        [decisionId, assertionId],
      );

      const secondPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'second',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(secondPublication.activated, true);
      assert.equal(secondPublication.fullArtifactCount, 48);
      assert.equal(secondPublication.deltaArtifactCount, 48);

      const delta = await published.delta('israel-palestine', 'domain-subdomains', 'filter', firstPublication.version);
      assert.equal('code' in delta, false);
      assert.deepEqual(delta.added, [['example.com', publicId, ['C03', 'C05']]]);
      assert.deepEqual(delta.removed, []);

      const originalP14 = await reasonCatalog.byCode('P14', 1);
      assert.ok(originalP14);
      await db.query(
        `UPDATE reason_definitions
         SET label = 'Documented Palestine solidarity action', updated_at = now()
         WHERE code = 'P14'`,
      );
      assert.equal((await reasonCatalog.byCode('P14', 1))?.label, originalP14.label);

      const nextCatalog = await publishReasonCatalogVersion(db, {
        notes: 'Integration-test catalog revision',
      });
      assert.equal(nextCatalog.version, 2);
      assert.equal(nextCatalog.entryCount, 60);
      assert.equal(await reasonCatalog.version(), 2);
      assert.equal(
        (await reasonCatalog.byCode('P14', 2))?.label,
        'Documented Palestine solidarity action',
      );
      assert.equal((await reasonCatalog.byCode('P14', 1))?.label, originalP14.label);

      const thirdPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'third',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(thirdPublication.activated, true);
      assert.equal((await published.full('israel-palestine', 'domain-subdomains', 'filter')).reasonCatalogVersion, 2);

      const artist = await db.query(
        `INSERT INTO entities (kind, canonical_name, slug)
         VALUES ('person', 'Example Artist', 'example-artist')
         RETURNING id::text`,
      );
      const artistEntityId = artist.rows[0].id;
      const campaignContext = await db.query(
        `SELECT cv.id::text AS campaign_version_id, cv.source_document_id::text AS source_document_id
         FROM campaign_versions cv
         JOIN campaigns c ON c.id = cv.campaign_id
         WHERE c.slug = 'artists4ceasefire' AND cv.version = 1`,
      );
      const campaignCapture = await db.query(
        `INSERT INTO source_captures (
           document_id, retrieved_at, capture_method, status
         ) VALUES ($1, now(), 'manual', 'available')
         RETURNING id::text`,
        [campaignContext.rows[0].source_document_id],
      );

      const staged = await stageCampaignImport(db, {
        campaignVersionId: campaignContext.rows[0].campaign_version_id,
        reasonCode: 'P03',
        sourceCaptureId: campaignCapture.rows[0].id,
        importKind: 'signatory-list',
        createdBy: 'integration-test',
        rows: [{ rawName: 'Example Artist' }, { rawName: 'Unknown Artist' }],
      });
      assert.equal(staged.rowCount, 2);
      assert.equal(staged.candidateRows, 1);
      assert.equal(staged.unresolvedRows, 1);

      const importRows = await db.query(
        `SELECT id::text, raw_name, resolution_state
         FROM official_import_rows
         WHERE batch_id = $1
         ORDER BY ordinal`,
        [staged.batchId],
      );
      assert.equal(importRows.rows[0].resolution_state, 'candidate');
      assert.equal(importRows.rows[1].resolution_state, 'unresolved');

      await approveCampaignImportRow(
        db,
        importRows.rows[0].id,
        artistEntityId,
        'integration-reviewer',
        'Identity verified for integration test.',
      );
      await markCampaignImportRow(
        db,
        importRows.rows[1].id,
        'skipped',
        'integration-reviewer',
        'No matching entity in integration fixture.',
      );
      await markCampaignImportReady(db, staged.batchId, 'integration-reviewer');
      const importCommit = await commitCampaignImport(db, staged.batchId, 'integration-reviewer');
      assert.equal(importCommit.assertionsCreated, 1);
      assert.equal(importCommit.proposalsCreated, 1);

      const importedAssertion = await db.query(
        `SELECT
           a.state,
           a.action_type,
           ar.reason_code,
           c.slug AS campaign_slug,
           count(asl.capture_id)::integer AS source_count
         FROM official_import_rows row
         JOIN assertions a ON a.id = row.assertion_id
         JOIN assertion_reasons ar ON ar.assertion_id = a.id
         JOIN campaign_versions cv ON cv.id = a.campaign_version_id
         JOIN campaigns c ON c.id = cv.campaign_id
         JOIN assertion_source_links asl ON asl.assertion_id = a.id
         WHERE row.batch_id = $1 AND row.raw_name = 'Example Artist'
         GROUP BY a.state, a.action_type, ar.reason_code, c.slug`,
        [staged.batchId],
      );
      assert.deepEqual(importedAssertion.rows[0], {
        state: 'published',
        action_type: 'signed-open-letter',
        reason_code: 'P03',
        campaign_slug: 'artists4ceasefire',
        source_count: 1,
      });

      const authorityCompany = await db.query(
        `INSERT INTO entities (kind, canonical_name, slug)
         VALUES ('company', 'Authority Listed Company', 'authority-listed-company')
         RETURNING id::text`,
      );
      const authoritySource = await db.query(
        `SELECT id::text
         FROM source_documents
         WHERE canonical_url = 'https://www.ohchr.org/sites/default/files/documents/hrbodies/hrcouncil/sessions-regular/session31/database-hrc3136/23-06-30-Update-israeli-settlement-opt-database-hrc3136.pdf'`,
      );
      const authorityCapture = await db.query(
        `INSERT INTO source_captures (
           document_id, retrieved_at, capture_method, status
         ) VALUES ($1, now(), 'manual', 'available')
         RETURNING id::text`,
        [authoritySource.rows[0].id],
      );
      const stagedAuthority = await stageAuthorityImport(db, {
        authoritySourceDocumentId: authoritySource.rows[0].id,
        reasonCode: 'C13',
        sourceCaptureId: authorityCapture.rows[0].id,
        importKind: 'target-list',
        createdBy: 'integration-test',
        rows: [{ rawName: 'Authority Listed Company' }],
      });
      assert.equal(stagedAuthority.candidateRows, 1);
      const authorityRow = await db.query(
        `SELECT id::text
         FROM official_import_rows
         WHERE batch_id = $1`,
        [stagedAuthority.batchId],
      );
      await approveCampaignImportRow(
        db,
        authorityRow.rows[0].id,
        authorityCompany.rows[0].id,
        'integration-reviewer',
        'Authority list identity verified.',
      );
      await markCampaignImportReady(db, stagedAuthority.batchId, 'integration-reviewer');
      const authorityCommit = await commitCampaignImport(
        db,
        stagedAuthority.batchId,
        'integration-reviewer',
      );
      assert.equal(authorityCommit.assertionsCreated, 1);
      assert.equal(authorityCommit.proposalsCreated, 1);
      const authorityAssertion = await db.query(
        `SELECT a.action_type, ar.reason_code
         FROM official_import_rows row
         JOIN assertions a ON a.id = row.assertion_id
         JOIN assertion_reasons ar ON ar.assertion_id = a.id
         WHERE row.batch_id = $1`,
        [stagedAuthority.batchId],
      );
      assert.deepEqual(authorityAssertion.rows[0], {
        action_type: 'listed-by-authority',
        reason_code: 'C13',
      });

      const proposals = await listMembershipProposals(db, 'pending', 10);
      assert.equal(proposals.length, 2);
      const artistProposal = proposals.find((proposal) => proposal.reasonCode === 'P03');
      assert.ok(artistProposal);
      assert.equal(artistProposal.proposedList, 'highlight');

      const artistIdentifier = await db.query(
        `INSERT INTO identifiers (
           kind_code, value, normalized_value, display_value, status
         ) VALUES ('instagram', 'exampleartist', 'exampleartist', 'exampleartist', 'active')
         RETURNING id::text`,
      );
      const artistAssertion = await db.query(
        `SELECT assertion_id::text
         FROM official_import_rows
         WHERE batch_id = $1 AND raw_name = 'Example Artist'`,
        [staged.batchId],
      );
      await db.query(
        `INSERT INTO identifier_assignments (
           identifier_id, entity_id, state, verification_assertion_id
         ) VALUES ($1, $2, 'verified', $3)`,
        [artistIdentifier.rows[0].id, artistEntityId, artistAssertion.rows[0].assertion_id],
      );

      const artistDecisionId = await approveMembershipProposal(
        db,
        artistProposal.id,
        'integration-reviewer',
        'Verified official signatory and identity.',
      );
      assert.ok(artistDecisionId);

      const fourthPublication = await publishCurrentState(db, store, {
        compilerVersion: 'integration-test',
        sourceRevision: 'fourth',
        expiresInMs: 60 * 60 * 1_000,
      });
      assert.equal(fourthPublication.activated, true);
      assert.deepEqual((await published.full('israel-palestine', 'instagram', 'highlight')).entries, [
        [
          'exampleartist',
          (await db.query(`SELECT public_id::text FROM entities WHERE id = $1`, [artistEntityId]))
            .rows[0].public_id,
          ['P03'],
        ],
      ]);

      const secondMigration = await applySqlMigrations(db, resolve('db/migrations'));
      assert.deepEqual(secondMigration.applied, []);
      assert.equal(secondMigration.alreadyApplied.length, 24);
    } finally {
      await db.close();
      await rm(artifactRoot, { recursive: true, force: true });
    }
  },
);
