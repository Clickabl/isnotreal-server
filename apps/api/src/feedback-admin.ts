import { feedbackStates, type FeedbackQueue, type FeedbackState } from '@isnotreal/application';
import {
  PostgresFeedbackInbox,
  FeedbackRevisionError,
  FeedbackValidationError,
} from '@isnotreal/persistence/feedback-inbox';
import type { SqlExecutor } from '@isnotreal/persistence';
import type { AdminRequest, AdminResponse } from './admin.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createFeedbackAdminRouter(db: SqlExecutor) {
  const inbox = new PostgresFeedbackInbox(db);
  return async (request: AdminRequest): Promise<AdminResponse | null> => {
    const path = request.pathname;
    if (!path.startsWith('/admin/api/v1/feedback')) return null;
    try {
      if (request.method === 'GET' && path === '/admin/api/v1/feedback/counts')
        return { status: 200, body: { counts: await inbox.counts() } };
      if (request.method === 'GET' && path === '/admin/api/v1/feedback') {
        const q = request.query;
        if (q.queue && !['all', 'evidence', 'product', 'safety'].includes(q.queue))
          throw new FeedbackValidationError('Invalid queue');
        if (q.state && !['all', 'open', ...feedbackStates].includes(q.state))
          throw new FeedbackValidationError('Invalid state');
        const limit = q.limit === undefined ? 50 : Number(q.limit);
        let after = null;
        if (q.afterId || q.afterDate) {
          if (
            !q.afterId ||
            !uuid.test(q.afterId) ||
            !q.afterDate ||
            !Number.isFinite(Date.parse(q.afterDate))
          )
            throw new FeedbackValidationError('Invalid cursor');
          after = { id: q.afterId, submittedAt: new Date(q.afterDate).toISOString() };
        }
        return {
          status: 200,
          body: await inbox.list({
            queue: q.queue && q.queue !== 'all' ? (q.queue as FeedbackQueue) : null,
            state: q.state === 'all' ? null : ((q.state ?? 'open') as FeedbackState | 'open'),
            limit,
            after,
          }),
        };
      }
      const match = /^\/admin\/api\/v1\/feedback\/([^/]+)\/(review|duplicates)$/.exec(path);
      if (!match || !match[1] || !uuid.test(match[1]))
        return { status: 404, body: { error: 'not_found' } };
      if (request.method === 'GET' && match[2] === 'duplicates')
        return { status: 200, body: { duplicates: await inbox.duplicates(match[1]) } };
      if (request.method === 'POST' && match[2] === 'review') {
        const body = request.body as Record<string, unknown> | null;
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          typeof body.state !== 'string' ||
          !feedbackStates.includes(body.state as FeedbackState) ||
          typeof body.expectedRevision !== 'number' ||
          typeof body.note !== 'string'
        )
          throw new FeedbackValidationError('Invalid review');
        if (
          body.duplicateOf !== undefined &&
          body.duplicateOf !== null &&
          (typeof body.duplicateOf !== 'string' || !uuid.test(body.duplicateOf))
        )
          throw new FeedbackValidationError('Invalid original report');
        return {
          status: 200,
          body: await inbox.review(
            match[1],
            {
              state: body.state as FeedbackState,
              expectedRevision: body.expectedRevision,
              note: body.note,
              ...(body.duplicateOf === undefined
                ? {}
                : { duplicateOf: body.duplicateOf as string | null }),
            },
            request.actorId,
          ),
        };
      }
      return { status: 405, body: { error: 'method_not_allowed' } };
    } catch (error) {
      if (error instanceof FeedbackRevisionError)
        return { status: 409, body: { error: 'review_conflict', message: error.message } };
      if (error instanceof FeedbackValidationError)
        return { status: 400, body: { error: 'invalid_review', message: error.message } };
      throw error;
    }
  };
}
