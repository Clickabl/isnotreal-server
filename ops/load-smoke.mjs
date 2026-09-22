import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';
const { fetch, AbortSignal, console } = globalThis;

const origin = new URL(process.env.LOAD_ORIGIN ?? 'http://127.0.0.1:3000');
const total = Number(process.env.LOAD_REQUESTS ?? 500);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 25);
if (!Number.isSafeInteger(total) || total < 1 || total > 100000) throw Error('Invalid LOAD_REQUESTS');
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 500)
  throw Error('Invalid LOAD_CONCURRENCY');
if (!['127.0.0.1', 'localhost'].includes(origin.hostname) && process.env.ALLOW_REMOTE_LOAD !== '1')
  throw Error('Refusing remote load test without ALLOW_REMOTE_LOAD=1');

const durations = [];
const statuses = new Map();
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= total) return;
    const start = performance.now();
    try {
      const response = await fetch(new URL(index % 5 === 0 ? '/readyz' : '/healthz', origin), {
        signal: AbortSignal.timeout(5000),
      });
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      await response.arrayBuffer();
    } catch {
      statuses.set(0, (statuses.get(0) ?? 0) + 1);
    }
    durations.push(performance.now() - start);
  }
}
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = performance.now() - started;
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0;
const failures = [...statuses].filter(([status]) => status < 200 || status >= 300).reduce((n, [, count]) => n + count, 0);
console.log(JSON.stringify({
  origin: origin.origin,
  requests: total,
  concurrency,
  requestsPerSecond: Number((total / (elapsed / 1000)).toFixed(1)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  p99Ms: Number(percentile(0.99).toFixed(1)),
  failures,
  statuses: Object.fromEntries(statuses),
}, null, 2));
if (failures) process.exitCode = 1;
