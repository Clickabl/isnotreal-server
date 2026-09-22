import { randomUUID } from 'node:crypto';
import { RequestGuard, RequestMetrics, clientAddress, routeClass } from './request-guard.js';
import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  PostgresAlternativeDirectory,
  PostgresPublicEntityDirectory,
  PostgresReasonCatalogReader,
  PostgresSubmissionWriter,
} from '@isnotreal/persistence';
import { PostgresModerationQueue } from '@isnotreal/persistence/moderation';
import { PostgresCauseCatalogReader } from '@isnotreal/persistence/causes';
import {
  FileArtifactStore,
  PgSqlExecutor,
  PostgresPublishedArtifactReader,
  PublicationUnavailableError,
} from '@isnotreal/persistence/runtime';
import { createPublicWebsite } from '@isnotreal/web';
import { createAdminRouter } from './admin.js';
import { createApiRouter } from './index.js';

export interface NodeApiRuntimeOptions {
  readonly databaseUrl: string;
  readonly artifactRoot: string;
  readonly host?: string;
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly maxDatabaseConnections?: number;
  readonly adminToken?: string;
  readonly adminActorId?: string;
  readonly adminDatabaseUrl?: string;
  readonly downloads?: Readonly<Record<string, string>>;
  readonly trustedProxyAddresses?: readonly string[];
  readonly publicOrigin?: string;
}
export interface RunningNodeApiRuntime {
  readonly host: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}
class HttpError extends Error {
  constructor(readonly statusCode: number) {
    super('Invalid request');
  }
}
function headers(response: ServerResponse, admin = false): void {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (!admin) {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, if-none-match');
  }
}
function send(
  response: ServerResponse,
  request: IncomingMessage,
  status: number,
  body: string | Uint8Array,
  type: string,
  cache = 'no-store',
): void {
  response.statusCode = status;
  response.setHeader('content-type', type);
  response.setHeader('cache-control', cache);
  if (status === 200 && request.method !== 'POST') {
    const etag = '"' + createHash('sha256').update(body).digest('hex') + '"';
    response.setHeader('etag', etag);
    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304;
      response.end();
      return;
    }
  }
  response.end(request.method === 'HEAD' ? undefined : body);
}
const json = (
  response: ServerResponse,
  request: IncomingMessage,
  status: number,
  value: unknown,
  cache = 'no-store',
) =>
  send(response, request, status, JSON.stringify(value), 'application/json; charset=utf-8', cache);
async function body(request: IncomingMessage, limit: number): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413);
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
    throw new HttpError(415);
  if (
    !String(request.headers['content-type'] ?? '')
      .toLowerCase()
      .startsWith('application/json')
  )
    throw new HttpError(415);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > limit) throw new HttpError(413);
    chunks.push(b);
  }
  if (!size) return null;
  if (
    !String(request.headers['content-type'] ?? '')
      .toLowerCase()
      .startsWith('application/json')
  )
    throw new HttpError(415);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400);
  }
}
function authorized(request: IncomingMessage, token: string): boolean {
  const supplied = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(token).digest();
  return supplied.length > 0 && timingSafeEqual(a, b);
}
export async function startNodeApiRuntime(
  options: NodeApiRuntimeOptions,
): Promise<RunningNodeApiRuntime> {
  const host = options.host ?? '127.0.0.1',
    port = options.port ?? 3000,
    limit = options.maxBodyBytes ?? 128 * 1024;
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isInteger(limit) ||
    limit < 1024 ||
    limit > 1024 * 1024
  )
    throw new Error('invalid runtime limits');
  if (options.adminToken && (!options.adminDatabaseUrl || options.adminToken.length < 32))
    throw new Error(
      'Admin needs a separate editor connection and a secret of at least 32 characters',
    );
  const db = PgSqlExecutor.create({
    connectionString: options.databaseUrl,
    maxConnections: options.maxDatabaseConnections ?? 20,
  });
  const adminDb =
    options.adminToken && options.adminDatabaseUrl
      ? PgSqlExecutor.create({
          connectionString: options.adminDatabaseUrl,
          maxConnections: 2,
          applicationName: 'isnotreal-editor',
        })
      : null;
  try {
    await db.healthCheck();
    if (adminDb) await adminDb.healthCheck();
  } catch (error) {
    await db.close();
    await adminDb?.close();
    throw error;
  }
  const store = new FileArtifactStore(options.artifactRoot);
  const entities = new PostgresPublicEntityDirectory(db),
    alternatives = new PostgresAlternativeDirectory(db),
    causes = new PostgresCauseCatalogReader(db),
    reasons = new PostgresReasonCatalogReader(db);
  const api = createApiRouter({
    entities,
    alternatives,
    causes,
    reasons,
    submissions: new PostgresSubmissionWriter(db),
    publications: new PostgresPublishedArtifactReader(db, store),
  });
  const web = createPublicWebsite({
    entities,
    alternatives,
    causes,
    reasons,
    ...(options.downloads ? { downloads: options.downloads } : {}),
  });
  const admin = adminDb
    ? createAdminRouter({ db: adminDb, moderation: new PostgresModerationQueue(adminDb) })
    : null;
  const guard = new RequestGuard(),
    metrics = new RequestMetrics();
  const publicOrigin = options.publicOrigin ?? 'https://isnotreal.click';
  const server = createServer({ maxHeaderSize: 16384 }, (request, response) => {
    const started = Date.now();
    const raw = request.url ?? '/';
    if (raw.length > 4096 || !raw.startsWith('/') || raw.startsWith('//')) {
      headers(response);
      json(response, request, 414, { error: 'invalid_target' });
      return;
    }
    const family = routeClass(raw.split('?')[0]!, request.method ?? 'GET');
    response.setHeader('x-request-id', randomUUID());
    const peer = clientAddress(
      request.socket.remoteAddress ?? '',
      typeof request.headers['x-real-ip'] === 'string' ? request.headers['x-real-ip'] : undefined,
      options.trustedProxyAddresses ?? [],
    );
    const admission = guard.admit(peer, family);
    if (!admission.ok) {
      headers(response, family === 'admin');
      response.setHeader('retry-after', String(admission.retryAfter));
      json(response, request, admission.status, { error: admission.error });
      metrics.observe(family, admission.status, Date.now() - started);
      return;
    }
    let recorded = false;
    const finish = () => {
      admission.release();
      if (!recorded) {
        recorded = true;
        metrics.observe(family, response.statusCode, Date.now() - started);
      }
    };
    response.once('close', finish);
    response.once('finish', finish);
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const isAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
      headers(response, isAdmin);
      if (isAdmin && (!admin || !options.adminToken)) {
        json(response, request, 404, { error: 'not_found' });
        return;
      }
      if (isAdmin && !authorized(request, options.adminToken!)) {
        response.setHeader('www-authenticate', 'Bearer realm="isnotreal-admin"');
        json(response, request, 401, { error: 'unauthorized' });
        return;
      }
      if (request.method === 'POST') {
        response.removeHeader('access-control-allow-origin');
        if (request.headers.origin && request.headers.origin !== publicOrigin) {
          json(response, request, 403, { error: 'origin_not_allowed' });
          return;
        }
      }
      if (
        isAdmin &&
        url.pathname === '/admin/api/v1/metrics' &&
        ['GET', 'HEAD'].includes(request.method ?? '')
      ) {
        json(response, request, 200, metrics.snapshot(guard.activeRequests));
        return;
      }
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('cache-control', 'no-store');
        response.end();
        return;
      }
      if (!['GET', 'HEAD', 'POST'].includes(request.method ?? '')) throw new HttpError(405);
      if (url.pathname === '/healthz') {
        json(response, request, 200, { ok: true });
        return;
      }
      if (url.pathname === '/readyz') {
        try {
          await db.healthCheck();
          json(response, request, 200, { ready: true });
        } catch {
          json(response, request, 503, { ready: false });
        }
        return;
      }
      const query: Record<string, string> = {};
      if ([...url.searchParams].length > 20) throw new HttpError(400);
      for (const [key, value] of url.searchParams) {
        if (key.length > 64 || value.length > 2048) throw new HttpError(400);
        query[key] = value;
      }
      const method = request.method === 'HEAD' ? 'GET' : (request.method ?? 'GET');
      if (isAdmin) {
        const result = await admin!({
          method,
          pathname: url.pathname,
          query,
          body: await body(request, limit),
          actorId: options.adminActorId ?? 'editor',
        });
        json(response, request, result.status, result.body);
        return;
      }
      if (method === 'GET' && url.pathname.startsWith('/data/')) {
        const key = url.pathname.slice(6);
        if (
          !/^publications\/[a-z0-9-]+\/[1-9]\d*\/(?:dictionary\.json|(?:x|tiktok|instagram|youtube|domain|domain-subdomains)\/(?:filter|highlight)\/(?:full|manifest|from-[1-9]\d*\.delta)\.json)$/.test(
            key,
          )
        ) {
          json(response, request, 404, { error: 'not_found' });
          return;
        }
        try {
          const bytes = await store.get(key);
          if (bytes.length > 64 * 1024 * 1024) throw new HttpError(413);
          send(
            response,
            request,
            200,
            bytes,
            'application/json; charset=utf-8',
            'public, max-age=31536000, immutable',
          );
        } catch (error) {
          if (error instanceof HttpError) throw error;
          json(response, request, 404, { error: 'not_found' });
        }
        return;
      }
      if (method === 'GET' && !url.pathname.startsWith('/api/')) {
        const result = await web(url.pathname, query);
        if (result?.kind === 'redirect') {
          response.statusCode = result.status;
          response.setHeader('location', result.location);
          response.setHeader('cache-control', 'no-store');
          response.end();
          return;
        }
        if (result?.kind === 'asset') {
          send(response, request, 200, result.body, result.contentType, 'public, max-age=300');
          return;
        }
        if (result?.kind === 'html') {
          send(
            response,
            request,
            result.status,
            result.html,
            'text/html; charset=utf-8',
            result.status === 200 && !['/report', '/editor'].includes(url.pathname)
              ? 'public, max-age=60'
              : 'no-store',
          );
          return;
        }
        if (result?.kind === 'bad-gateway') throw new HttpError(502);
        json(response, request, 404, { error: 'not_found' });
        return;
      }
      const result = await api({
        method,
        pathname: url.pathname,
        query,
        body: await body(request, limit),
      });
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      json(
        response,
        request,
        result.status,
        result.body,
        method === 'GET' && result.status === 200 ? 'public, max-age=60' : 'no-store',
      );
    })().catch((error: unknown) => {
      const status =
        error instanceof HttpError
          ? error.statusCode
          : error instanceof PublicationUnavailableError
            ? 503
            : 500;
      if (!response.headersSent)
        json(response, request, status, {
          error:
            status === 503
              ? 'publication_unavailable'
              : status === 500
                ? 'internal_error'
                : 'invalid_request',
        });
      else response.end();
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 1000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await db.close();
    await adminDb?.close();
    throw error;
  }
  const address = server.address();
  let closed = false;
  return {
    host,
    port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
      await adminDb?.close();
    },
  };
}
