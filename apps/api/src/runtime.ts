import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  PostgresAlternativeDirectory,
  PostgresPublicEntityDirectory,
  PostgresReasonCatalogReader,
  PostgresSubmissionWriter,
} from '@isnotreal/persistence';
import { PostgresModerationQueue } from '@isnotreal/persistence/moderation';
import {
  FileArtifactStore,
  PgSqlExecutor,
  PostgresPublishedArtifactReader,
} from '@isnotreal/persistence/runtime';
import { createAdminRouter, type AdminRequest } from './admin.js';
import { createApiRouter, type ApiRequest, type ApiResponse } from './index.js';

export interface NodeApiRuntimeOptions {
  readonly databaseUrl: string;
  readonly artifactRoot: string;
  readonly host?: string;
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly maxDatabaseConnections?: number;
  readonly adminToken?: string;
  readonly adminActorId?: string;
}

export interface RunningNodeApiRuntime {
  readonly host: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function startNodeApiRuntime(
  options: NodeApiRuntimeOptions,
): Promise<RunningNodeApiRuntime> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3_000;
  const maxBodyBytes = options.maxBodyBytes ?? 128 * 1_024;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('invalid port');
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1_024) {
    throw new Error('invalid max body size');
  }

  const db = PgSqlExecutor.create({
    connectionString: options.databaseUrl,
    maxConnections: options.maxDatabaseConnections ?? 20,
    applicationName: 'isnotreal-api',
  });
  await db.healthCheck();

  const store = new FileArtifactStore(options.artifactRoot);
  const router = createApiRouter({
    entities: new PostgresPublicEntityDirectory(db),
    reasons: new PostgresReasonCatalogReader(db),
    alternatives: new PostgresAlternativeDirectory(db),
    submissions: new PostgresSubmissionWriter(db),
    publications: new PostgresPublishedArtifactReader(db, store),
  });
  const adminToken = options.adminToken?.trim() || null;
  const adminActorId = options.adminActorId?.trim() || 'admin';
  const adminRouter = adminToken
    ? createAdminRouter({
        db,
        moderation: new PostgresModerationQueue(db),
      })
    : null;

  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      router,
      adminRouter,
      adminToken,
      adminActorId,
      db,
      maxBodyBytes,
    ).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error(`request failed: ${message}`);
      }
      if (!response.headersSent) {
        writeSecurityHeaders(response);
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
      }
      if (!response.writableEnded) {
        response.end(
          JSON.stringify({ error: status === 500 ? 'internal_error' : 'invalid_request' }),
        );
      }
    });
  });
  hardenServer(server);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  let closed = false;

  return {
    host,
    port: boundPort,
    close: async () => {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  router: ReturnType<typeof createApiRouter>,
  adminRouter: ReturnType<typeof createAdminRouter> | null,
  adminToken: string | null,
  adminActorId: string,
  db: PgSqlExecutor,
  maxBodyBytes: number,
): Promise<void> {
  writeSecurityHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-max-age': '86400',
      'cache-control': 'public, max-age=86400',
    });
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true }, { 'cache-control': 'no-store' });
    return;
  }
  if (url.pathname === '/readyz') {
    try {
      await db.healthCheck();
      sendJson(response, 200, { ready: true }, { 'cache-control': 'no-store' });
    } catch {
      sendJson(response, 503, { ready: false }, { 'cache-control': 'no-store' });
    }
    return;
  }

  const body = await readBody(request, maxBodyBytes);
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams) query[key] = value;

  if (url.pathname.startsWith('/admin/')) {
    if (!adminRouter || !adminToken) {
      sendJson(response, 404, { error: 'not_found' }, { 'cache-control': 'no-store' });
      return;
    }
    const suppliedToken = bearerToken(request.headers.authorization);
    if (!suppliedToken || !timingSafeTokenEqual(suppliedToken, adminToken)) {
      sendJson(
        response,
        401,
        { error: 'unauthorized' },
        {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="isnotreal-admin"',
        },
      );
      return;
    }
    const adminRequest: AdminRequest = {
      method: request.method ?? 'GET',
      pathname: url.pathname,
      query,
      body,
      actorId: adminActorId,
    };
    const result = await adminRouter(adminRequest);
    sendJson(response, result.status, result.body, { 'cache-control': 'no-store' });
    return;
  }

  const apiRequest: ApiRequest = {
    method: request.method ?? 'GET',
    pathname: url.pathname,
    query,
    body,
  };
  const result = await router(apiRequest);
  sendApiResponse(response, apiRequest, result);
}

async function readBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBodyBytes) throw new HttpError(413, 'request body too large');
    chunks.push(buffer);
  }
  if (total === 0) return null;

  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'request body must be JSON');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

function sendApiResponse(response: ServerResponse, request: ApiRequest, result: ApiResponse): void {
  const cacheControl = cachePolicy(request, result.status);
  sendJson(response, result.status, result.body, {
    ...result.headers,
    'cache-control': cacheControl,
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function cachePolicy(request: ApiRequest, status: number): string {
  if (request.method !== 'GET' || status !== 200) return 'no-store';
  if (request.pathname === '/api/v1/reasons/compact')
    return 'public, max-age=3600, stale-while-revalidate=86400';
  if (request.pathname === '/api/v1/reasons' || request.pathname.startsWith('/api/v1/reasons/'))
    return 'public, max-age=300, stale-while-revalidate=3600';
  if (request.pathname.includes('/lists/')) return 'public, max-age=60, stale-while-revalidate=300';
  return 'public, max-age=60, stale-while-revalidate=300';
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

function timingSafeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

function writeSecurityHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
}

function hardenServer(server: Server): void {
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
}
