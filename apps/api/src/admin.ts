import type {
  CommunitySubmissionState,
  PostgresModerationQueue,
} from '@isnotreal/persistence/moderation';
import {
  approveOfficialImportRow,
  commitOfficialImport,
  createOfficialImportEntity,
  markOfficialImportReady,
  markOfficialImportRow,
} from '@isnotreal/persistence/campaign-import';
import {
  approveMembershipProposal,
  listMembershipProposals,
  rejectMembershipProposal,
} from '@isnotreal/persistence/membership-review';
import type { SqlExecutor } from '@isnotreal/persistence';

export interface AdminRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
  readonly actorId: string;
}

export interface AdminResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface AdminDependencies {
  readonly db: SqlExecutor;
  readonly moderation: PostgresModerationQueue;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionStates = new Set<CommunitySubmissionState>([
  'pending',
  'triaged',
  'accepted',
  'rejected',
  'duplicate',
]);

export function createAdminRouter(deps: AdminDependencies) {
  return async (request: AdminRequest): Promise<AdminResponse> => {
    if (request.method === 'GET' && request.pathname === '/admin/api/v1/submissions') {
      const state = optionalSubmissionState(request.query.state);
      if (state === false) return response(400, { error: 'invalid_state' });
      const limit = parseLimit(request.query.limit, 100, 500);
      if (limit === null) return response(400, { error: 'invalid_limit' });
      return response(200, {
        submissions: await deps.moderation.listCommunitySubmissions(state, limit),
      });
    }

    const submissionReview = /^\/admin\/api\/v1\/submissions\/([0-9a-f-]+)\/review$/i.exec(
      request.pathname,
    );
    if (request.method === 'POST' && submissionReview) {
      const id = validUuid(submissionReview[1]);
      const body = parseReviewBody(request.body);
      if (!id || !body || !submissionStates.has(body.state as CommunitySubmissionState)) {
        return response(400, { error: 'invalid_review' });
      }
      if (body.state === 'pending') return response(400, { error: 'invalid_review_state' });
      await deps.moderation.reviewCommunitySubmission(
        id,
        body.state as Exclude<CommunitySubmissionState, 'pending'>,
        request.actorId,
        body.note,
      );
      return response(200, { ok: true });
    }

    if (request.method === 'GET' && request.pathname === '/admin/api/v1/imports') {
      const state = nullableString(request.query.state);
      const limit = parseLimit(request.query.limit, 100, 500);
      if (limit === null) return response(400, { error: 'invalid_limit' });
      return response(200, {
        batches: await deps.moderation.listOfficialImportBatches(state, limit),
      });
    }

    const importRows = /^\/admin\/api\/v1\/imports\/([0-9a-f-]+)\/rows$/i.exec(request.pathname);
    if (request.method === 'GET' && importRows) {
      const batchId = validUuid(importRows[1]);
      const limit = parseLimit(request.query.limit, 500, 1000);
      if (!batchId || limit === null) return response(400, { error: 'invalid_request' });
      return response(200, {
        rows: await deps.moderation.listOfficialImportRows(batchId, limit),
      });
    }

    const importRowApprove = /^\/admin\/api\/v1\/import-rows\/([0-9a-f-]+)\/approve$/i.exec(
      request.pathname,
    );
    if (request.method === 'POST' && importRowApprove) {
      const rowId = validUuid(importRowApprove[1]);
      const body = parseEntityReviewBody(request.body);
      if (!rowId || !body) return response(400, { error: 'invalid_request' });
      await approveOfficialImportRow(deps.db, rowId, body.entityId, request.actorId, body.note);
      return response(200, { ok: true });
    }

    const importRowCreate =
      /^\/admin\/api\/v1\/import-rows\/([0-9a-f-]+)\/create-entity$/i.exec(request.pathname);
    if (request.method === 'POST' && importRowCreate) {
      const rowId = validUuid(importRowCreate[1]);
      const body = parseCreateEntityBody(request.body);
      if (!rowId || !body) return response(400, { error: 'invalid_request' });
      const entityId = await createOfficialImportEntity(
        deps.db,
        rowId,
        body.kind,
        request.actorId,
        body.note,
      );
      return response(200, { ok: true, entityId });
    }

    const importRowDisposition =
      /^\/admin\/api\/v1\/import-rows\/([0-9a-f-]+)\/(skip|reject)$/i.exec(request.pathname);
    if (request.method === 'POST' && importRowDisposition) {
      const rowId = validUuid(importRowDisposition[1]);
      const action = importRowDisposition[2];
      const body = parseNoteBody(request.body, true);
      if (!rowId || !action || !body) return response(400, { error: 'invalid_request' });
      await markOfficialImportRow(
        deps.db,
        rowId,
        action === 'skip' ? 'skipped' : 'rejected',
        request.actorId,
        body.note,
      );
      return response(200, { ok: true });
    }

    const importReady = /^\/admin\/api\/v1\/imports\/([0-9a-f-]+)\/ready$/i.exec(request.pathname);
    if (request.method === 'POST' && importReady) {
      const batchId = validUuid(importReady[1]);
      if (!batchId) return response(400, { error: 'invalid_request' });
      await markOfficialImportReady(deps.db, batchId, request.actorId);
      return response(200, { ok: true });
    }

    const importCommit = /^\/admin\/api\/v1\/imports\/([0-9a-f-]+)\/commit$/i.exec(
      request.pathname,
    );
    if (request.method === 'POST' && importCommit) {
      const batchId = validUuid(importCommit[1]);
      if (!batchId) return response(400, { error: 'invalid_request' });
      return response(200, await commitOfficialImport(deps.db, batchId, request.actorId));
    }

    if (request.method === 'GET' && request.pathname === '/admin/api/v1/membership-proposals') {
      const state = nullableString(request.query.state) ?? 'pending';
      if (!['pending', 'approved', 'rejected', 'withdrawn', 'applied', 'all'].includes(state)) {
        return response(400, { error: 'invalid_state' });
      }
      const limit = parseLimit(request.query.limit, 100, 500);
      if (limit === null) return response(400, { error: 'invalid_limit' });
      return response(200, {
        proposals: await listMembershipProposals(
          deps.db,
          state === 'all'
            ? null
            : (state as 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'applied'),
          limit,
        ),
      });
    }

    const proposalApprove = /^\/admin\/api\/v1\/membership-proposals\/([0-9a-f-]+)\/approve$/i.exec(
      request.pathname,
    );
    if (request.method === 'POST' && proposalApprove) {
      const proposalId = validUuid(proposalApprove[1]);
      const body = parseNoteBody(request.body, false);
      if (!proposalId || !body) return response(400, { error: 'invalid_request' });
      const decisionId = await approveMembershipProposal(
        deps.db,
        proposalId,
        request.actorId,
        body.note,
      );
      return response(200, { ok: true, decisionId });
    }

    const proposalReject = /^\/admin\/api\/v1\/membership-proposals\/([0-9a-f-]+)\/reject$/i.exec(
      request.pathname,
    );
    if (request.method === 'POST' && proposalReject) {
      const proposalId = validUuid(proposalReject[1]);
      const body = parseNoteBody(request.body, true);
      if (!proposalId || !body) return response(400, { error: 'invalid_request' });
      await rejectMembershipProposal(deps.db, proposalId, request.actorId, body.note);
      return response(200, { ok: true });
    }

    if (request.method === 'GET' && request.pathname === '/admin/api/v1/publication-issues') {
      const limit = parseLimit(request.query.limit, 500, 1000);
      if (limit === null) return response(400, { error: 'invalid_limit' });
      return response(200, {
        issues: await deps.moderation.listPublicationValidationIssues(limit),
      });
    }

    return response(404, { error: 'not_found' });
  };
}

function response(status: number, body: unknown): AdminResponse {
  return { status, body };
}

function parseLimit(raw: string | undefined, fallback: number, max: number): number | null {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null;
}

function optionalSubmissionState(
  value: string | undefined,
): CommunitySubmissionState | null | false {
  if (value === undefined || value === '' || value === 'all') return null;
  return submissionStates.has(value as CommunitySubmissionState)
    ? (value as CommunitySubmissionState)
    : false;
}

function validUuid(value: string | undefined): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function parseReviewBody(body: unknown): { readonly state: string; readonly note: string } | null {
  if (!isRecord(body) || typeof body.state !== 'string') return null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 10_000) return null;
  return { state: body.state, note };
}

function parseCreateEntityBody(
  body: unknown,
):
  | {
      readonly kind: 'person' | 'music-group' | 'company' | 'brand' | 'organization';
      readonly note: string;
    }
  | null {
  if (!isRecord(body) || typeof body.kind !== 'string') return null;
  const kinds = new Set(['person', 'music-group', 'company', 'brand', 'organization']);
  if (!kinds.has(body.kind)) return null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 10_000) return null;
  return {
    kind: body.kind as 'person' | 'music-group' | 'company' | 'brand' | 'organization',
    note,
  };
}

function parseEntityReviewBody(
  body: unknown,
): { readonly entityId: string; readonly note: string } | null {
  if (!isRecord(body)) return null;
  const entityId = validUuid(typeof body.entityId === 'string' ? body.entityId : undefined);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!entityId || note.length > 10_000) return null;
  return { entityId, note };
}

function parseNoteBody(body: unknown, required: boolean): { readonly note: string } | null {
  if (body === null || body === undefined) return required ? null : { note: '' };
  if (!isRecord(body)) return null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 10_000 || (required && note.length === 0)) return null;
  return { note };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
