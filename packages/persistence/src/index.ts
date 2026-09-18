import type {
  AlternativeDirectory,
  AlternativeOption,
  ListKind,
  PublicAssertionDetail,
  PublicEntityDirectory,
  PublicEntityProfile,
  PublicEntitySummary,
  PublicIdentifierSummary,
  PublicationCandidate,
  PublicationCandidateReader,
  PublicationChannel,
  PublicEntityId,
  PublicReasonDetail,
  PublicRelationshipSummary,
  PublicSource,
  ReasonCatalogEntry,
  ReasonCatalogReader,
  SubmissionInput,
  SubmissionReceipt,
  SubmissionWriter,
} from '@isnotreal/application';

export interface SqlQueryResult<Row> {
  readonly rows: readonly Row[];
}

export interface SqlExecutor {
  query<Row extends object>(sql: string, params?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

type EntityRow = {
  internal_id: string;
  public_id: string;
  slug: string;
  canonical_name: string;
  kind: PublicEntitySummary['kind'];
  lists: readonly ListKind[] | null;
};

type IdentifierRow = {
  kind_code: string;
  normalized_value: string;
  display_value: string;
  match_scope: PublicIdentifierSummary['matchScope'];
};

type RelationshipRow = {
  direction: PublicRelationshipSummary['direction'];
  relationship_type: string;
  ownership_percent: string | null;
  valid_from: string | null;
  public_id: string;
  slug: string;
  canonical_name: string;
  kind: PublicEntitySummary['kind'];
  lists: readonly ListKind[] | null;
};

type ReasonEvidenceRow = {
  reason_code: string;
  reason_label: string;
  reason_description: string;
  assertion_id: string;
  assertion_summary: string;
  occurred_on: string | null;
  source_url: string | null;
  source_title: string | null;
  source_publisher: string | null;
  source_retrieved_at: string | null;
  source_primary: boolean | null;
};

type ReasonCatalogRow = {
  code: string;
  label: string;
  description: string;
  category: string;
  default_list: ReasonCatalogEntry['defaultList'];
  publication_enabled: boolean;
  subject_scope: NonNullable<ReasonCatalogEntry['evidenceRequirement']>['subjectScope'] | null;
  evidence_mode: NonNullable<ReasonCatalogEntry['evidenceRequirement']>['evidenceMode'] | null;
  validity_mode: NonNullable<ReasonCatalogEntry['evidenceRequirement']>['validityMode'] | null;
  public_criteria: string | null;
  exclusion_criteria: string | null;
  primary_or_authoritative_required: boolean | null;
  minimum_evidence_items: number | null;
  reverify_after_days: number | null;
  inheritance_policy:
    NonNullable<ReasonCatalogEntry['evidenceRequirement']>['inheritancePolicy'] | null;
  campaigns: ReasonCatalogEntry['campaigns'];
  authority_sources: ReasonCatalogEntry['authoritySources'];
};

type AlternativeRow = {
  public_id: string;
  slug: string;
  canonical_name: string;
  kind: PublicEntitySummary['kind'];
  lists: readonly ListKind[] | null;
  relationship_type: string;
  context_key: string;
  rationale: string | null;
  destination_url: string | null;
  destination_channel: string | null;
};

type SubmissionRow = { id: string; submitted_at: string };

type CandidateRow = {
  channel: PublicationChannel;
  list_kind: ListKind;
  identifier: string;
  entity_public_id: string;
  reason_codes: readonly string[];
};

type MutableAssertion = {
  summary: string;
  occurredOn: string | null;
  sources: PublicSource[];
};

type MutableReason = {
  label: string;
  description: string;
  assertions: Map<string, MutableAssertion>;
};

const entitySelect = `
SELECT
  resolved.id::text AS internal_id,
  resolved.public_id::text AS public_id,
  resolved.slug,
  resolved.canonical_name,
  resolved.kind,
  COALESCE(
    array_agg(DISTINCT md.list_kind) FILTER (
      WHERE md.state = 'active' AND md.decision = 'include'
    ),
    ARRAY[]::text[]
  ) AS lists
FROM entities requested
JOIN entity_resolution er ON er.requested_entity_id = requested.id
JOIN entities resolved
  ON resolved.id = er.resolved_entity_id
 AND resolved.status = 'active'
LEFT JOIN membership_decisions md ON md.entity_id = resolved.id
`;

export class PostgresPublicEntityDirectory implements PublicEntityDirectory {
  constructor(private readonly db: SqlExecutor) {}

  async byPublicId(publicId: PublicEntityId): Promise<PublicEntityProfile | null> {
    return this.load(`${entitySelect} WHERE requested.public_id = $1 GROUP BY resolved.id`, [
      publicId,
    ]);
  }

  async bySlug(slug: string): Promise<PublicEntityProfile | null> {
    return this.load(`${entitySelect} WHERE requested.slug = $1 GROUP BY resolved.id`, [slug]);
  }

  async search(query: string, limit: number): Promise<readonly PublicEntitySummary[]> {
    const pattern = `%${query.trim()}%`;
    const result = await this.db.query<EntityRow>(
      `${entitySelect}
       WHERE resolved.status = 'active'
         AND (
           resolved.canonical_name ILIKE $1
           OR EXISTS (
             SELECT 1 FROM entity_names n
             WHERE n.entity_id = resolved.id AND n.name ILIKE $1
           )
         )
       GROUP BY resolved.id
       ORDER BY
         CASE WHEN lower(resolved.canonical_name) = lower($2) THEN 0 ELSE 1 END,
         resolved.canonical_name
       LIMIT $3`,
      [pattern, query.trim(), limit],
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  private async load(sql: string, params: readonly unknown[]): Promise<PublicEntityProfile | null> {
    const result = await this.db.query<EntityRow>(sql, params);
    const row = result.rows[0];
    if (!row) return null;
    const [identifiers, relationships, reasons] = await Promise.all([
      this.loadIdentifiers(row.internal_id),
      this.loadRelationships(row.internal_id),
      this.loadReasons(row.internal_id),
    ]);
    return { ...this.toSummary(row), identifiers, relationships, reasons };
  }

  private toSummary(row: EntityRow): PublicEntitySummary {
    return {
      publicId: row.public_id,
      slug: row.slug,
      name: row.canonical_name,
      kind: row.kind,
      lists: row.lists ?? [],
    };
  }

  private async loadIdentifiers(entityId: string): Promise<readonly PublicIdentifierSummary[]> {
    const result = await this.db.query<IdentifierRow>(
      `SELECT i.kind_code, i.normalized_value, i.display_value, i.match_scope
       FROM identifier_assignments ia
       JOIN identifiers i ON i.id = ia.identifier_id
       WHERE ia.entity_id = $1
         AND ia.state = 'verified'
         AND ia.valid_to IS NULL
         AND i.status = 'active'
       ORDER BY i.kind_code, i.normalized_value`,
      [entityId],
    );
    return result.rows.map((row) => ({
      kind: row.kind_code,
      value: row.normalized_value,
      displayValue: row.display_value,
      matchScope: row.match_scope,
    }));
  }

  private async loadRelationships(entityId: string): Promise<readonly PublicRelationshipSummary[]> {
    const result = await this.db.query<RelationshipRow>(
      `SELECT
         'outbound'::text AS direction,
         rel.relationship_type,
         rel.ownership_percent::text,
         rel.valid_from::text,
         target.public_id::text AS public_id,
         target.slug,
         target.canonical_name,
         target.kind,
         ARRAY(
           SELECT DISTINCT md.list_kind
           FROM membership_decisions md
           WHERE md.entity_id = target.id
             AND md.state = 'active'
             AND md.decision = 'include'
           ORDER BY md.list_kind
         ) AS lists
       FROM entity_relationships rel
       JOIN entity_resolution er ON er.requested_entity_id = rel.to_entity_id
       JOIN entities target ON target.id = er.resolved_entity_id AND target.status = 'active'
       WHERE rel.from_entity_id = $1
         AND rel.status = 'verified'
         AND rel.valid_to IS NULL
       UNION ALL
       SELECT
         'inbound'::text AS direction,
         rel.relationship_type,
         rel.ownership_percent::text,
         rel.valid_from::text,
         source.public_id::text AS public_id,
         source.slug,
         source.canonical_name,
         source.kind,
         ARRAY(
           SELECT DISTINCT md.list_kind
           FROM membership_decisions md
           WHERE md.entity_id = source.id
             AND md.state = 'active'
             AND md.decision = 'include'
           ORDER BY md.list_kind
         ) AS lists
       FROM entity_relationships rel
       JOIN entity_resolution er ON er.requested_entity_id = rel.from_entity_id
       JOIN entities source ON source.id = er.resolved_entity_id AND source.status = 'active'
       WHERE rel.to_entity_id = $1
         AND rel.status = 'verified'
         AND rel.valid_to IS NULL
       ORDER BY relationship_type, canonical_name`,
      [entityId],
    );

    return result.rows.map((row) => ({
      direction: row.direction,
      relationshipType: row.relationship_type,
      ownershipPercent: row.ownership_percent === null ? null : Number(row.ownership_percent),
      validFrom: row.valid_from,
      entity: {
        publicId: row.public_id,
        slug: row.slug,
        name: row.canonical_name,
        kind: row.kind,
        lists: row.lists ?? [],
      },
    }));
  }

  private async loadReasons(entityId: string): Promise<readonly PublicReasonDetail[]> {
    const result = await this.db.query<ReasonEvidenceRow>(
      `SELECT
         rd.code AS reason_code,
         rd.label AS reason_label,
         rd.description AS reason_description,
         a.id::text AS assertion_id,
         a.summary AS assertion_summary,
         a.occurred_on::text AS occurred_on,
         sd.canonical_url AS source_url,
         sd.title AS source_title,
         sd.publisher AS source_publisher,
         sc.retrieved_at::text AS source_retrieved_at,
         asl.is_primary AS source_primary
       FROM membership_decisions md
       JOIN membership_decision_reasons mdr ON mdr.decision_id = md.id
       JOIN reason_definitions rd ON rd.code = mdr.reason_code
       JOIN assertions a ON a.id = mdr.assertion_id
       LEFT JOIN assertion_source_links asl ON asl.assertion_id = a.id
       LEFT JOIN source_captures sc ON sc.id = asl.capture_id
       LEFT JOIN source_documents sd ON sd.id = sc.document_id
       WHERE md.entity_id = $1
         AND md.state = 'active'
         AND md.decision = 'include'
         AND a.state = 'published'
       ORDER BY rd.code, a.occurred_on NULLS LAST, a.id, asl.is_primary DESC NULLS LAST`,
      [entityId],
    );

    const reasons = new Map<string, MutableReason>();

    for (const row of result.rows) {
      let reason = reasons.get(row.reason_code);
      if (!reason) {
        reason = {
          label: row.reason_label,
          description: row.reason_description,
          assertions: new Map(),
        };
        reasons.set(row.reason_code, reason);
      }

      let assertion = reason.assertions.get(row.assertion_id);
      if (!assertion) {
        assertion = {
          summary: row.assertion_summary,
          occurredOn: row.occurred_on,
          sources: [],
        };
        reason.assertions.set(row.assertion_id, assertion);
      }

      if (row.source_url && row.source_title && row.source_retrieved_at) {
        assertion.sources.push({
          url: row.source_url,
          title: row.source_title,
          publisher: row.source_publisher,
          retrievedAt: row.source_retrieved_at,
          primary: row.source_primary ?? false,
        });
      }
    }

    return [...reasons.entries()].map(([code, reason]) => ({
      code,
      label: reason.label,
      description: reason.description,
      assertions: [...reason.assertions.entries()].map(
        ([id, assertion]): PublicAssertionDetail => ({
          id,
          summary: assertion.summary,
          occurredOn: assertion.occurredOn,
          sources: assertion.sources,
        }),
      ),
    }));
  }
}

export class PostgresReasonCatalogReader implements ReasonCatalogReader {
  constructor(private readonly db: SqlExecutor) {}

  async version(): Promise<number> {
    const result = await this.db.query<{ version: number }>(
      `SELECT version FROM reason_catalog_versions WHERE state = 'active' LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('no active reason catalog version');
    return row.version;
  }

  async byCode(code: string): Promise<ReasonCatalogEntry | null> {
    const entries = await this.list();
    return entries.find((entry) => entry.code === code) ?? null;
  }

  async list(): Promise<readonly ReasonCatalogEntry[]> {
    const result = await this.db.query<ReasonCatalogRow>(
      `SELECT
         rd.code,
         rd.label,
         rd.description,
         rd.category,
         rd.default_list,
         rd.publication_enabled,
         rd.subject_scope,
         rd.evidence_mode,
         rd.validity_mode,
         rd.public_criteria,
         rd.exclusion_criteria,
         rd.primary_or_authoritative_required,
         rd.minimum_evidence_items,
         rd.reverify_after_days,
         rd.inheritance_policy,
         rd.campaigns,
         rd.authority_sources
       FROM current_reason_catalog rd
       ORDER BY rd.code`,
    );
    return result.rows.map((row) => ({
      code: row.code,
      label: row.label,
      description: row.description,
      category: row.category,
      defaultList: row.default_list,
      publicationEnabled: row.publication_enabled,
      evidenceRequirement:
        row.subject_scope &&
        row.evidence_mode &&
        row.validity_mode &&
        row.public_criteria !== null &&
        row.exclusion_criteria !== null &&
        row.primary_or_authoritative_required !== null &&
        row.minimum_evidence_items !== null &&
        row.inheritance_policy
          ? {
              subjectScope: row.subject_scope,
              evidenceMode: row.evidence_mode,
              validityMode: row.validity_mode,
              publicCriteria: row.public_criteria,
              exclusionCriteria: row.exclusion_criteria,
              primaryOrAuthoritativeRequired: row.primary_or_authoritative_required,
              minimumEvidenceItems: row.minimum_evidence_items,
              reverifyAfterDays: row.reverify_after_days,
              inheritancePolicy: row.inheritance_policy,
            }
          : null,
      campaigns: row.campaigns,
      authoritySources: row.authority_sources,
    }));
  }
}

export class PostgresAlternativeDirectory implements AlternativeDirectory {
  constructor(private readonly db: SqlExecutor) {}

  async list(
    sourceEntityPublicId: PublicEntityId,
    contextKey: string | null,
    channel: string | null,
  ): Promise<readonly AlternativeOption[]> {
    const result = await this.db.query<AlternativeRow>(
      `SELECT
         alt.public_id::text AS public_id,
         alt.slug,
         alt.canonical_name,
         alt.kind,
         COALESCE(
           array_agg(DISTINCT md.list_kind) FILTER (
             WHERE md.state = 'active' AND md.decision = 'include'
           ),
           ARRAY[]::text[]
         ) AS lists,
         ea.relationship_type,
         ea.context_key,
         ea.rationale,
         ad.destination_url,
         ad.channel AS destination_channel
       FROM entities source
       JOIN entity_alternatives ea ON ea.source_entity_id = source.id
       JOIN entities alt ON alt.id = ea.alternative_entity_id
       LEFT JOIN membership_decisions md ON md.entity_id = alt.id
       LEFT JOIN alternative_destinations ad
         ON ad.entity_id = alt.id
        AND ad.active = true
        AND ad.verified_at IS NOT NULL
        AND ($3::text IS NULL OR ad.channel = $3 OR ad.channel IS NULL)
       WHERE source.public_id = $1
         AND ea.state = 'approved'
         AND ($2::text IS NULL OR ea.context_key = $2 OR ea.context_key = 'general')
         AND alt.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM membership_decisions blocked
           WHERE blocked.entity_id = alt.id
             AND blocked.list_kind = 'filter'
             AND blocked.state = 'active'
             AND blocked.decision = 'include'
         )
       GROUP BY alt.id, ea.id, ad.id
       ORDER BY ea.rank, ad.priority NULLS LAST, alt.canonical_name`,
      [sourceEntityPublicId, contextKey, channel],
    );

    return result.rows.map((row) => ({
      entity: {
        publicId: row.public_id,
        slug: row.slug,
        name: row.canonical_name,
        kind: row.kind,
        lists: row.lists ?? [],
      },
      relationshipType: row.relationship_type,
      contextKey: row.context_key,
      rationale: row.rationale,
      destinationUrl: row.destination_url,
      destinationChannel: row.destination_channel,
    }));
  }

  async preferred(
    sourceEntityPublicId: PublicEntityId,
    contextKey: string | null,
    channel: string | null,
  ): Promise<AlternativeOption | null> {
    const options = await this.list(sourceEntityPublicId, contextKey, channel);
    return options.find((option) => option.destinationUrl !== null) ?? null;
  }
}

export class PostgresSubmissionWriter implements SubmissionWriter {
  constructor(private readonly db: SqlExecutor) {}

  async create(input: SubmissionInput): Promise<SubmissionReceipt> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.query<SubmissionRow>(
        `INSERT INTO community_submissions (
           entity_id,
           identifier_kind,
           identifier_value,
           submission_type,
           proposed_list,
           proposed_reason_code,
           narrative,
           submitter_contact_ref
         )
         VALUES (
           (SELECT id FROM entities WHERE public_id = $1),
           $2, $3, $4, $5, $6, $7, $8
         )
         RETURNING id::text, submitted_at::text`,
        [
          input.entityPublicId,
          input.identifierKind,
          input.identifierValue,
          input.submissionType,
          input.proposedList,
          input.proposedReasonCode,
          input.narrative,
          input.submitterContactRef,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error('submission insert did not return a row');

      for (const url of input.sourceUrls) {
        await tx.query(`INSERT INTO submission_sources (submission_id, url) VALUES ($1, $2)`, [
          row.id,
          url,
        ]);
      }

      return { id: row.id, submittedAt: row.submitted_at, state: 'pending' };
    });
  }
}

export class PostgresPublicationCandidateReader implements PublicationCandidateReader {
  constructor(private readonly db: SqlExecutor) {}

  async candidates(
    channel: PublicationChannel,
    list: ListKind,
  ): Promise<readonly PublicationCandidate[]> {
    const result = await this.db.query<CandidateRow>(
      `SELECT channel, list_kind, identifier, entity_public_id, reason_codes
       FROM publication_candidates
       WHERE channel = $1 AND list_kind = $2
       ORDER BY identifier`,
      [channel, list],
    );
    return result.rows.map((row) => ({
      channel: row.channel,
      list: row.list_kind,
      identifier: row.identifier,
      entityId: row.entity_public_id,
      reasonCodes: row.reason_codes,
    }));
  }
}
