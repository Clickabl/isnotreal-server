import type {
  AlternativeDirectory,
  PublicationReader,
  PublicEntityDirectory,
  ReasonCatalogReader,
  SubmissionInput,
  SubmissionWriter,
} from '@isnotreal/application';
import {
  PROTOCOL_SCHEMA_VERSION,
  type ListKind,
  type PublicationChannel,
} from '@isnotreal/protocol';

export interface ApiRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface CauseCatalogPort {
  list(): Promise<readonly unknown[]>;
  bySlug(slug: string): Promise<unknown | null>;
}

export interface ApiDependencies {
  readonly entities: PublicEntityDirectory;
  readonly causes: CauseCatalogPort;
  readonly reasons: ReasonCatalogReader;
  readonly alternatives: AlternativeDirectory;
  readonly submissions: SubmissionWriter;
  readonly publications: PublicationReader;
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' } as const;
const channels = new Set<PublicationChannel>([
  'x',
  'tiktok',
  'instagram',
  'youtube',
  'domain',
  'domain-subdomains',
]);
const lists = new Set<ListKind>(['filter', 'highlight']);
const submissionTypes = new Set<SubmissionInput['submissionType']>([
  'add-evidence',
  'incorrect-information',
  'changed-position',
  'wrong-identifier',
  'missing-identifier',
  'company-relationship',
  'suggest-alternative',
  'new-entity',
]);

export function createApiRouter(deps: ApiDependencies) {
  return async (request: ApiRequest): Promise<ApiResponse> => {
    if (request.method === 'GET' && request.pathname === '/api/v1/causes') {
      return response(200, {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        causes: await deps.causes.list(),
      });
    }

    const causeMatch = /^\/api\/v1\/causes\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(request.pathname);
    if (request.method === 'GET' && causeMatch) {
      const slug = causeMatch[1];
      if (!slug) return response(404, { error: 'not_found' });
      const cause = await deps.causes.bySlug(slug);
      return cause
        ? response(200, { schemaVersion: PROTOCOL_SCHEMA_VERSION, cause })
        : response(404, { error: 'not_found' });
    }

    if (request.method === 'GET' && request.pathname === '/api/v1/search') {
      const q = request.query.q?.trim() ?? '';
      if (q.length < 2) return response(400, { error: 'query_too_short' });
      const requestedLimit = Number.parseInt(request.query.limit ?? '20', 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(50, Math.max(1, requestedLimit))
        : 20;
      return response(200, { results: await deps.entities.search(q, limit) });
    }

    if (request.method === 'GET' && request.pathname === '/api/v1/reasons/compact') {
      const requestedVersion = parseOptionalCatalogVersion(request.query.version);
      if (requestedVersion === false) return response(400, { error: 'invalid_catalog_version' });
      const catalogVersion = requestedVersion ?? (await deps.reasons.version());
      const reasons = await deps.reasons.list(catalogVersion);
      if (reasons.length === 0) return response(404, { error: 'catalog_not_found' });
      return response(200, {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        catalogVersion,
        labels: reasons.map((reason) => [reason.code, reason.label] as const),
      });
    }

    if (request.method === 'GET' && request.pathname === '/api/v1/reasons') {
      const requestedVersion = parseOptionalCatalogVersion(request.query.version);
      if (requestedVersion === false) return response(400, { error: 'invalid_catalog_version' });
      const catalogVersion = requestedVersion ?? (await deps.reasons.version());
      const reasons = await deps.reasons.list(catalogVersion);
      if (reasons.length === 0) return response(404, { error: 'catalog_not_found' });
      return response(200, {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        catalogVersion,
        reasons,
      });
    }

    const catalogCompactMatch = /^\/api\/v1\/reason-catalogs\/(current|\d+)\/compact$/.exec(
      request.pathname,
    );
    if (request.method === 'GET' && catalogCompactMatch) {
      const segment = catalogCompactMatch[1];
      if (!segment) return response(404, { error: 'not_found' });
      const catalogVersion =
        segment === 'current' ? await deps.reasons.version() : parseCatalogVersionSegment(segment);
      if (catalogVersion === null) return response(404, { error: 'catalog_not_found' });
      const reasons = await deps.reasons.list(catalogVersion);
      if (reasons.length === 0) return response(404, { error: 'catalog_not_found' });
      return response(200, {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        catalogVersion,
        labels: reasons.map((reason) => [reason.code, reason.label] as const),
      });
    }

    const catalogReasonsMatch = /^\/api\/v1\/reason-catalogs\/(current|\d+)\/reasons$/.exec(
      request.pathname,
    );
    if (request.method === 'GET' && catalogReasonsMatch) {
      const segment = catalogReasonsMatch[1];
      if (!segment) return response(404, { error: 'not_found' });
      const catalogVersion =
        segment === 'current' ? await deps.reasons.version() : parseCatalogVersionSegment(segment);
      if (catalogVersion === null) return response(404, { error: 'catalog_not_found' });
      const reasons = await deps.reasons.list(catalogVersion);
      return reasons.length > 0
        ? response(200, { schemaVersion: PROTOCOL_SCHEMA_VERSION, catalogVersion, reasons })
        : response(404, { error: 'catalog_not_found' });
    }

    const reasonMatch = /^\/api\/v1\/reasons\/([A-Z][A-Z0-9_-]{1,15})$/.exec(request.pathname);
    if (request.method === 'GET' && reasonMatch) {
      const code = reasonMatch[1];
      if (!code) return response(404, { error: 'not_found' });
      const requestedVersion = parseOptionalCatalogVersion(request.query.version);
      if (requestedVersion === false) return response(400, { error: 'invalid_catalog_version' });
      const catalogVersion = requestedVersion ?? (await deps.reasons.version());
      const reason = await deps.reasons.byCode(code, catalogVersion);
      return reason
        ? response(200, {
            schemaVersion: PROTOCOL_SCHEMA_VERSION,
            catalogVersion,
            reason,
          })
        : response(404, { error: 'not_found' });
    }

    const catalogReasonMatch =
      /^\/api\/v1\/reason-catalogs\/(current|\d+)\/reasons\/([A-Z][A-Z0-9_-]{1,15})$/.exec(
        request.pathname,
      );
    if (request.method === 'GET' && catalogReasonMatch) {
      const segment = catalogReasonMatch[1];
      const code = catalogReasonMatch[2];
      if (!segment || !code) return response(404, { error: 'not_found' });
      const catalogVersion =
        segment === 'current' ? await deps.reasons.version() : parseCatalogVersionSegment(segment);
      if (catalogVersion === null) return response(404, { error: 'catalog_not_found' });
      const reason = await deps.reasons.byCode(code, catalogVersion);
      return reason
        ? response(200, { schemaVersion: PROTOCOL_SCHEMA_VERSION, catalogVersion, reason })
        : response(404, { error: 'not_found' });
    }

    const entityMatch = /^\/api\/v1\/entities\/(\d+)$/.exec(request.pathname);
    if (request.method === 'GET' && entityMatch) {
      const publicId = entityMatch[1];
      if (!publicId) return response(404, { error: 'not_found' });
      const entity = await deps.entities.byPublicId(publicId);
      return entity ? response(200, entity) : response(404, { error: 'not_found' });
    }

    const slugMatch = /^\/api\/v1\/entities\/slug\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
      request.pathname,
    );
    if (request.method === 'GET' && slugMatch) {
      const slug = slugMatch[1];
      if (!slug) return response(404, { error: 'not_found' });
      const entity = await deps.entities.bySlug(slug);
      return entity ? response(200, entity) : response(404, { error: 'not_found' });
    }

    const alternativesMatch = /^\/api\/v1\/entities\/(\d+)\/alternatives$/.exec(request.pathname);
    if (request.method === 'GET' && alternativesMatch) {
      const publicId = alternativesMatch[1];
      if (!publicId) return response(404, { error: 'not_found' });
      const options = await deps.alternatives.list(
        publicId,
        request.query.context ?? null,
        request.query.channel ?? null,
      );
      return response(200, { alternatives: options });
    }

    if (request.method === 'POST' && request.pathname === '/api/v1/submissions') {
      const input = parseSubmission(request.body);
      if (!input) return response(400, { error: 'invalid_submission' });
      if (
        input.proposedReasonCode !== null &&
        (await deps.reasons.byCode(input.proposedReasonCode)) === null
      ) {
        return response(400, { error: 'unknown_reason_code' });
      }
      return response(202, await deps.submissions.create(input));
    }

    const publicationMatch =
      /^\/api\/v1\/lists\/([^/]+)\/(filter|highlight)\/(manifest|full|delta)$/.exec(
        request.pathname,
      );
    if (request.method === 'GET' && publicationMatch) {
      const channelValue = publicationMatch[1];
      const listValue = publicationMatch[2];
      const operation = publicationMatch[3];
      if (!channelValue || !listValue || !operation) {
        return response(404, { error: 'not_found' });
      }
      if (!isChannel(channelValue) || !isList(listValue)) {
        return response(404, { error: 'not_found' });
      }
      if (operation === 'manifest') {
        return response(200, await deps.publications.manifest(channelValue, listValue));
      }
      if (operation === 'full') {
        return response(200, await deps.publications.full(channelValue, listValue));
      }
      const from = request.query.from;
      if (!from) return response(400, { error: 'missing_from_version' });
      return response(200, await deps.publications.delta(channelValue, listValue, from));
    }

    return response(404, { error: 'not_found' });
  };
}

function response(status: number, body: unknown): ApiResponse {
  return { status, headers: jsonHeaders, body };
}

function isChannel(value: string): value is PublicationChannel {
  return channels.has(value as PublicationChannel);
}

function isList(value: string): value is ListKind {
  return lists.has(value as ListKind);
}

function parseSubmission(body: unknown): SubmissionInput | null {
  if (!isRecord(body)) return null;
  const type = body.submissionType;
  const narrative = body.narrative;
  if (typeof type !== 'string' || !submissionTypes.has(type as SubmissionInput['submissionType'])) {
    return null;
  }
  if (typeof narrative !== 'string' || narrative.trim().length < 3 || narrative.length > 10_000) {
    return null;
  }

  const proposedList = body.proposedList;
  if (proposedList !== null && proposedList !== undefined && !isListValue(proposedList))
    return null;

  const sourceUrls = body.sourceUrls;
  if (!Array.isArray(sourceUrls) || sourceUrls.length > 20) return null;
  if (sourceUrls.some((url) => typeof url !== 'string' || !isHttpUrl(url))) return null;

  const entityPublicId = nullableString(body.entityPublicId);
  if (entityPublicId !== null && !/^\d+$/.test(entityPublicId)) return null;

  const identifierKind = nullableString(body.identifierKind);
  const identifierValue = nullableString(body.identifierValue);
  if (identifierKind && identifierKind.length > 64) return null;
  if (identifierValue && identifierValue.length > 512) return null;

  const proposedReasonCode = nullableString(body.proposedReasonCode);
  if (proposedReasonCode && !/^[A-Z][A-Z0-9_-]{1,15}$/.test(proposedReasonCode)) return null;

  const submitterContactRef = nullableString(body.submitterContactRef);
  if (submitterContactRef && submitterContactRef.length > 512) return null;

  return {
    entityPublicId,
    identifierKind,
    identifierValue,
    submissionType: type as SubmissionInput['submissionType'],
    proposedList: proposedList === undefined ? null : proposedList,
    proposedReasonCode,
    narrative: narrative.trim(),
    sourceUrls: [...new Set(sourceUrls as string[])],
    submitterContactRef,
  };
}

function parseOptionalCatalogVersion(value: string | undefined): number | null | false {
  if (value === undefined || value.trim() === '') return null;
  const parsed = parseCatalogVersionSegment(value);
  return parsed ?? false;
}

function parseCatalogVersionSegment(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isListValue(value: unknown): value is ListKind | null {
  return value === null || value === 'filter' || value === 'highlight';
}

function isHttpUrl(value: string): boolean {
  if (value.length > 2_048 || /\s/.test(value)) return false;
  const schemeLength = value.startsWith('https://') ? 8 : value.startsWith('http://') ? 7 : 0;
  return schemeLength > 0 && value.length > schemeLength;
}
