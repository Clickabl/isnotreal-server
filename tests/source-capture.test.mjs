import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicIpAddress } from '../packages/persistence/dist/source-capture.js';

test('source capture rejects private and reserved IPv4 ranges without overblocking public neighbors', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.2',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }

  for (const address of ['1.1.1.1', '8.8.8.8', '198.51.101.1', '203.0.114.1']) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
});

test('source capture rejects local/reserved IPv6 and IPv4-mapped private addresses', () => {
  for (const address of [
    '::',
    '::1',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }

  assert.equal(isPublicIpAddress('2001:4860:4860::8888'), true);
  assert.equal(isPublicIpAddress('::ffff:8.8.8.8'), true);
});
