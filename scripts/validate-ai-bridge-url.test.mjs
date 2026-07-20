import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiBridgeUrl } from './validate-ai-bridge-url.mjs';

test('accepts HTTPS origins using a hostname or IP address', () => {
  assert.equal(
    validateAiBridgeUrl('https://bridge.example.com'),
    'https://bridge.example.com',
  );
  assert.equal(
    validateAiBridgeUrl('https://192.0.2.1:8443/'),
    'https://192.0.2.1:8443',
  );
});

test('rejects malformed or unsafe bridge URLs', () => {
  for (const value of [
    undefined,
    '',
    'https://',
    'https://bridge.example bad',
    ' http://bridge.example.com',
    'http://bridge.example.com',
    'https://user:password@bridge.example.com',
    'https://bridge.example.com/api',
    'https://bridge.example.com?debug=true',
    'https://bridge.example.com#health',
  ]) {
    assert.throws(() => validateAiBridgeUrl(value), TypeError);
  }
});
