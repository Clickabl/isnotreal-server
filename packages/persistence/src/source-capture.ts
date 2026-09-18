import { createHash } from 'node:crypto';
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
    await assertPublicHttpUrl(current);

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json,text/plain,application/pdf,*/*;q=0.1',
        'user-agent': options.userAgent,
      },
    });

    if (isRedirect(response.status)) {
      if (redirectCount === options.maxRedirects) {
        throw new Error('source capture redirect limit exceeded');
      }
      const location = response.headers.get('location');
      if (!location) throw new Error('source capture redirect missing location');
      current = new URL(location, current);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`source capture returned HTTP ${response.status}`);
    }

    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      const length = Number(declaredLength);
      if (Number.isFinite(length) && length > options.maxBytes) {
        throw new Error('source capture exceeds size limit');
      }
    }

    const bytes = await readLimitedBody(response, options.maxBytes);
    return {
      bytes,
      finalUrl: current.toString(),
      status: response.status,
      contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  }

  throw new Error('source capture redirect loop');
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
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

  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('source capture private/reserved IP is forbidden');
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error('source capture hostname did not resolve');
  if (addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error('source capture hostname resolves to private/reserved IP');
  }
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return false;
  if (value.startsWith('fc') || value.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(value)) return false;
  if (value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:')) return false;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return isPublicIpv4(mapped[1]);
  return true;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('source capture exceeds size limit');
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
