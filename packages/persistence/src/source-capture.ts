import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import type { ArtifactStore } from './runtime.js';
import type { SqlExecutor } from './index.js';

export interface CaptureSourceOptions {
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly userAgent?: string;
}

export interface CaptureSourceResult {
  readonly captureId: string;
  readonly documentId: string;
  readonly finalUrl: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly contentType: string | null;
  readonly storageKey: string;
  readonly retrievedAt: string;
}

interface SourceDocumentRow {
  readonly id: string;
  readonly canonical_url: string;
}

interface CaptureInsertRow {
  readonly id: string;
  readonly retrieved_at: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;

export async function captureSourceDocument(
  db: SqlExecutor,
  store: ArtifactStore,
  documentId: string,
  options: CaptureSourceOptions = {},
): Promise<CaptureSourceResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_024 || maxBytes > 100 * 1024 * 1024) {
    throw new Error('invalid source capture maxBytes');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('invalid source capture timeout');
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new Error('invalid source capture redirect limit');
  }

  const source = await db.query<SourceDocumentRow>(
    `SELECT id::text, canonical_url
     FROM source_documents
     WHERE id = $1`,
    [documentId],
  );
  const document = source.rows[0];
  if (!document) throw new Error('source document not found');

  const fetched = await fetchTrustedSource(document.canonical_url, {
    maxBytes,
    timeoutMs,
    maxRedirects,
    userAgent: options.userAgent ?? 'isnotreal-source-capture/1 (+https://isnotreal.click)',
  });

  const hash = createHash('sha256').update(fetched.bytes).digest('hex');
  const storageKey = `source-captures/${document.id}/${hash}.bin`;
  await store.put(storageKey, fetched.bytes);

  const existing = await db.query<CaptureInsertRow>(
    `SELECT id::text, retrieved_at::text
     FROM source_captures
     WHERE document_id = $1
       AND content_hash = $2
       AND status = 'available'
     ORDER BY retrieved_at DESC
     LIMIT 1`,
    [document.id, hash],
  );
  const prior = existing.rows[0];
  if (prior) {
    return {
      captureId: prior.id,
      documentId: document.id,
      finalUrl: fetched.finalUrl,
      sha256: hash,
      byteSize: fetched.bytes.byteLength,
      contentType: fetched.contentType,
      storageKey,
      retrievedAt: prior.retrieved_at,
    };
  }

  const inserted = await db.query<CaptureInsertRow>(
    `INSERT INTO source_captures (
       document_id,
       retrieved_at,
       content_hash,
       storage_uri,
       capture_method,
       http_status,
       status,
       final_url,
       content_type,
       byte_size,
       etag,
       last_modified
     ) VALUES ($1, now(), $2, $3, 'http', $4, 'available', $5, $6, $7, $8, $9)
     RETURNING id::text, retrieved_at::text`,
    [
      document.id,
      hash,
      `artifact://${storageKey}`,
      fetched.status,
      fetched.finalUrl,
      fetched.contentType,
      fetched.bytes.byteLength,
      fetched.etag,
      fetched.lastModified,
    ],
  );
  const capture = inserted.rows[0];
  if (!capture) throw new Error('source capture insert failed');

  return {
    captureId: capture.id,
    documentId: document.id,
    finalUrl: fetched.finalUrl,
    sha256: hash,
    byteSize: fetched.bytes.byteLength,
    contentType: fetched.contentType,
    storageKey,
    retrievedAt: capture.retrieved_at,
  };
}

export async function captureCurrentReasonAuthoritySources(
  db: SqlExecutor,
  store: ArtifactStore,
  options: CaptureSourceOptions = {},
): Promise<readonly CaptureSourceResult[]> {
  const sources = await db.query<{ id: string }>(
    `SELECT DISTINCT sd.id::text
     FROM current_reason_catalog catalog
     CROSS JOIN LATERAL jsonb_array_elements(catalog.authority_sources) authority
     JOIN source_documents sd ON sd.canonical_url = authority ->> 'url'
     ORDER BY sd.id::text`,
  );

  const results: CaptureSourceResult[] = [];
  for (const source of sources.rows) {
    results.push(await captureSourceDocument(db, store, source.id, options));
  }
  return results;
}

interface TrustedFetchOptions {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly userAgent: string;
}

interface TrustedFetchResult {
  readonly bytes: Uint8Array;
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

async function fetchTrustedSource(
  initialUrl: string,
  options: TrustedFetchOptions,
): Promise<TrustedFetchResult> {
  let current = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const target = await resolvePublicTarget(current);
    const response = await requestPinned(current, target, options);

    if (isRedirect(response.status)) {
      if (redirectCount === options.maxRedirects) {
        throw new Error('source capture redirect limit exceeded');
      }
      const location = response.location;
      if (!location) throw new Error('source capture redirect missing location');
      current = new URL(location, current);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`source capture returned HTTP ${response.status}`);
    }

    return {
      bytes: response.bytes,
      finalUrl: current.toString(),
      status: response.status,
      contentType: response.contentType,
      etag: response.etag,
      lastModified: response.lastModified,
    };
  }

  throw new Error('source capture redirect loop');
}

interface ResolvedTarget {
  readonly address: string;
  readonly family: 4 | 6;
}

async function resolvePublicTarget(url: URL): Promise<ResolvedTarget> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('source capture only supports HTTP(S)');
  }
  if (url.username || url.password) throw new Error('source capture URL credentials are forbidden');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('source capture custom ports are forbidden');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('source capture local hostname is forbidden');
  }

  const literal = isIP(hostname);
  if (literal) {
    if (!isPublicIpAddress(hostname))
      throw new Error('source capture private/reserved IP is forbidden');
    return { address: hostname, family: literal as 4 | 6 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error('source capture hostname did not resolve');
  if (addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw new Error('source capture hostname resolves to private/reserved IP');
  }
  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error('source capture hostname has no usable address');
  }
  return { address: selected.address, family: selected.family };
}

interface PinnedResponse {
  readonly status: number;
  readonly bytes: Uint8Array;
  readonly location: string | null;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

async function requestPinned(
  url: URL,
  target: ResolvedTarget,
  options: TrustedFetchOptions,
): Promise<PinnedResponse> {
  return new Promise<PinnedResponse>((resolve, reject) => {
    const headers = {
      accept:
        'text/html,application/xhtml+xml,application/json,text/plain,application/pdf,*/*;q=0.1',
      'user-agent': options.userAgent,
      host: url.host,
    };
    const onResponse = (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      const header = (name: string): string | null => {
        const value = response.headers[name];
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
      };
      const location = header('location');
      if (isRedirect(status)) {
        response.resume();
        resolve({
          status,
          bytes: new Uint8Array(),
          location,
          contentType: header('content-type'),
          etag: header('etag'),
          lastModified: header('last-modified'),
        });
        return;
      }
      const declaredLength = header('content-length');
      if (declaredLength !== null) {
        const length = Number(declaredLength);
        if (Number.isFinite(length) && length > options.maxBytes) {
          response.destroy();
          reject(new Error('source capture exceeds size limit'));
          return;
        }
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer | Uint8Array) => {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        total += bytes.byteLength;
        if (total > options.maxBytes) {
          response.destroy(new Error('source capture exceeds size limit'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('error', reject);
      response.on('end', () => {
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve({
          status,
          bytes,
          location,
          contentType: header('content-type'),
          etag: header('etag'),
          lastModified: header('last-modified'),
        });
      });
    };
    const common = {
      hostname: target.address,
      family: target.family,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers,
      agent: false as const,
    };
    const request =
      url.protocol === 'https:'
        ? httpsRequest({ ...common, servername: url.hostname }, onResponse)
        : httpRequest(common, onResponse);
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error('source capture timed out'));
    });
    request.on('error', reject);
    request.end();
  });
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, third] = parts;
  if (a === undefined || b === undefined || third === undefined) return false;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (third === 0 || third === 2)) return false;
  if (a === 192 && b === 88 && third === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && third === 100) return false;
  if (a === 203 && b === 0 && third === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (
    value === '::' ||
    value === '::1' ||
    value === '0:0:0:0:0:0:0:0' ||
    value === '0:0:0:0:0:0:0:1'
  ) {
    return false;
  }
  if (value.startsWith('fc') || value.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(value)) return false;
  if (value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:')) return false;
  if (value.startsWith('64:ff9b:')) return false;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return isPublicIpv4(mapped[1]);
  if (value.startsWith('::ffff:')) return false;
  return true;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
