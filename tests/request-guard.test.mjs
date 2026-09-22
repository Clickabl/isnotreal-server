import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RequestGuard,
  RequestMetrics,
  clientAddress,
  routeClass,
} from '../apps/api/dist/request-guard.js';

test('write throttling is per client and releases are idempotent', () => {
  let now = 1000;
  const guard = new RequestGuard(100, 100, () => now);
  for (let n = 0; n < 6; n++) {
    const result = guard.admit('192.0.2.1', 'write');
    assert.equal(result.ok, true);
    result.release();
    result.release();
  }
  assert.equal(guard.activeRequests, 0);
  assert.deepEqual(guard.admit('192.0.2.1', 'write'), {
    ok: false,
    status: 429,
    retryAfter: 10,
    error: 'rate_limited',
  });
  const other = guard.admit('192.0.2.2', 'write');
  assert.equal(other.ok, true);
  other.release();
  now += 10000;
  const refill = guard.admit('192.0.2.1', 'write');
  assert.equal(refill.ok, true);
  refill.release();
});
test('concurrency and map sizes remain bounded under client churn', () => {
  let now = 0;
  const guard = new RequestGuard(2, 2, () => now);
  const first = guard.admit('one', 'page');
  const second = guard.admit('two', 'page');
  assert.equal(guard.admit('three', 'page').status, 503);
  first.release();
  second.release();
  assert.equal(guard.admit('three', 'page').status, 503);
  assert.equal(guard.size, 2);
  now = 130000;
  const third = guard.admit('three', 'page');
  assert.equal(third.ok, true);
  third.release();
  assert.equal(guard.size, 1);
});
test('proxy headers are ignored unless immediate proxy is explicitly trusted', () => {
  assert.equal(clientAddress('192.0.2.1', '198.51.100.3', []), '192.0.2.1');
  assert.equal(clientAddress('::ffff:127.0.0.1', '198.51.100.3', ['127.0.0.1']), '198.51.100.3');
  assert.equal(clientAddress('127.0.0.1', '198.51.100.3, 10.0.0.1', ['127.0.0.1']), '127.0.0.1');
  assert.equal(
    clientAddress('2001:db8:42:5::1', undefined, []),
    clientAddress('2001:db8:42:5:ffff::12', undefined, []),
  );
});
test('metrics use bounded route families without user paths or identifiers', () => {
  const metrics = new RequestMetrics();
  metrics.observe(routeClass('/api/v1/search', 'GET'), 200, 4);
  metrics.observe(routeClass('/someone-private', 'GET'), 404, 2);
  assert.equal(JSON.stringify(metrics.snapshot(0)).includes('someone-private'), false);
  assert.equal(metrics.snapshot(0).requests['search:2xx'], 1);
});
