import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export type RouteClass = 'health' | 'write' | 'search' | 'admin' | 'data' | 'page';
export function routeClass(path: string, method: string): RouteClass {
  if (path === '/healthz' || path === '/readyz') return 'health';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (method === 'POST') return 'write';
  if (path === '/search' || path === '/api/v1/search') return 'search';
  if (path.startsWith('/data/')) return 'data';
  return 'page';
}
function normalizedIp(raw: string): string {
  const ip = raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return 'unknown';
  // Aggregate IPv6 clients to /64. This prevents rotating interface IDs from
  // creating an unbounded limiter map. Addresses are never written to logs.
  const [left = '', right = ''] = ip.toLowerCase().split('::');
  const l = left ? left.split(':') : [];
  const r = right ? right.split(':') : [];
  const full = ip.includes('::')
    ? [...l, ...Array<string>(8 - l.length - r.length).fill('0'), ...r]
    : l;
  return (
    full
      .slice(0, 4)
      .map((part) => Number.parseInt(part, 16).toString(16))
      .join(':') + '::/64'
  );
}
export function clientAddress(
  peer: string,
  forwarded: string | undefined,
  trusted: readonly string[],
): string {
  // Trust only one explicitly configured immediate proxy and one valid address.
  // X-Forwarded-For is deliberately not interpreted as a client-provided chain.
  const peerBare = peer.startsWith('::ffff:') ? peer.slice(7) : peer;
  const candidate = forwarded?.trim();
  return normalizedIp(
    trusted.includes(peerBare) && candidate && isIP(candidate) ? candidate : peerBare,
  );
}
interface Bucket {
  tokens: number;
  at: number;
  expires: number;
}
export type Admission =
  | { ok: true; release: () => void }
  | { ok: false; status: 429 | 503; retryAfter: number; error: string };
export class RequestGuard {
  private readonly salt = randomBytes(32);
  private readonly buckets = new Map<string, Bucket>();
  private readonly active = new Map<string, number>();
  private inFlight = 0;
  private nextSweep = 0;
  constructor(
    private readonly maxConcurrent = 200,
    private readonly capacity = 20000,
    private readonly clock: () => number = Date.now,
  ) {
    if (
      !Number.isSafeInteger(maxConcurrent) ||
      maxConcurrent < 1 ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1
    )
      throw new Error('Invalid request guard bounds');
  }
  get size(): number {
    return this.buckets.size;
  }
  get activeRequests(): number {
    return this.inFlight;
  }
  admit(address: string, family: RouteClass): Admission {
    const now = this.clock();
    if (now >= this.nextSweep) {
      for (const [key, value] of this.buckets) if (value.expires <= now) this.buckets.delete(key);
      this.nextSweep = now + 10000;
    }
    const key = createHmac('sha256', this.salt).update(address).digest('hex');
    if (this.inFlight >= this.maxConcurrent || (this.active.get(key) ?? 0) >= 12)
      return { ok: false, status: 503, retryAfter: 1, error: 'busy' };
    const policy: Record<RouteClass, [number, number]> = {
      health: [120, 120],
      write: [6, 6],
      search: [30, 30],
      admin: [60, 60],
      data: [120, 120],
      page: [120, 120],
    };
    const [burst, perMinute] = policy[family];
    const bucketKey = key + ':' + family;
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      // Do not evict live buckets: churn would otherwise bypass existing limits.
      if (this.buckets.size >= this.capacity)
        return { ok: false, status: 503, retryAfter: 10, error: 'busy' };
      bucket = { tokens: burst, at: now, expires: now + 120000 };
      this.buckets.set(bucketKey, bucket);
    }
    bucket.tokens = Math.min(
      burst,
      bucket.tokens + (Math.max(0, now - bucket.at) * perMinute) / 60000,
    );
    bucket.at = now;
    bucket.expires = now + 120000;
    if (bucket.tokens < 1)
      return {
        ok: false,
        status: 429,
        retryAfter: Math.max(1, Math.ceil(((1 - bucket.tokens) * 60) / perMinute)),
        error: 'rate_limited',
      };
    bucket.tokens -= 1;
    this.inFlight += 1;
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.inFlight -= 1;
        const count = (this.active.get(key) ?? 1) - 1;
        if (count > 0) this.active.set(key, count);
        else this.active.delete(key);
      },
    };
  }
}
export class RequestMetrics {
  private readonly counts = new Map<string, number>();
  private readonly latency = new Map<
    RouteClass,
    { count: number; totalMs: number; maxMs: number }
  >();
  observe(family: RouteClass, status: number, duration: number): void {
    const key = family + ':' + Math.floor(status / 100) + 'xx';
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    const value = this.latency.get(family) ?? { count: 0, totalMs: 0, maxMs: 0 };
    value.count += 1;
    value.totalMs += duration;
    value.maxMs = Math.max(value.maxMs, duration);
    this.latency.set(family, value);
  }
  snapshot(inFlight: number) {
    return {
      scope: 'this-process',
      inFlight,
      requests: Object.fromEntries(this.counts),
      latency: Object.fromEntries(this.latency),
    };
  }
}
