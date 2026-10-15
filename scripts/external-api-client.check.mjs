import assert from 'node:assert/strict';
import test from 'node:test';
import { NasDashApiError, NasDashExternalApiClient } from '../examples/external-api-client.mjs';

const key = 'ndk_synthetic_test_key';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

test('client sends the API key only as a bearer header and omits credentials', async () => {
  let captured;
  const client = new NasDashExternalApiClient({
    baseUrl: 'https://nasdash.example.test',
    apiKey: key,
    fetchImpl: async (url, init) => {
      captured = { url: String(url), init };
      return jsonResponse({ status: 'ok', apiVersion: 'v1', time: '2026-01-01T00:00:00.000Z' });
    },
  });

  await client.health();
  assert.equal(captured.url, 'https://nasdash.example.test/api/v1/external/health');
  assert.equal(captured.init.headers.Authorization, `Bearer ${key}`);
  assert.equal(captured.init.credentials, 'omit');
  assert.equal(captured.url.includes(key), false);
});

test('client rejects cleartext remote URLs while allowing localhost development', () => {
  assert.throws(
    () => new NasDashExternalApiClient({ baseUrl: 'http://nasdash.example.test', apiKey: key }),
    /must use HTTPS/,
  );
  assert.doesNotThrow(
    () => new NasDashExternalApiClient({ baseUrl: 'http://127.0.0.1:2514', apiKey: key }),
  );
  assert.doesNotThrow(
    () => new NasDashExternalApiClient({ baseUrl: 'http://[::1]:2514', apiKey: key }),
  );
});

test('client exposes stable rate-limit metadata without response bodies or keys', async () => {
  const client = new NasDashExternalApiClient({
    baseUrl: 'https://nasdash.example.test',
    apiKey: key,
    fetchImpl: async () => jsonResponse({
      error: { code: 'rate_limited', message: 'Too many requests.' },
      requestId: '00000000-0000-4000-8000-000000000000',
      ignored: key,
    }, { status: 429, headers: { 'retry-after': '17' } }),
  });

  await assert.rejects(client.health(), error => {
    assert.ok(error instanceof NasDashApiError);
    assert.equal(error.status, 429);
    assert.equal(error.code, 'rate_limited');
    assert.equal(error.retryAfter, 17);
    assert.equal(error.requestId, '00000000-0000-4000-8000-000000000000');
    assert.equal(String(error).includes(key), false);
    return true;
  });
});

for (const [status, code] of [[401, 'invalid_api_key'], [403, 'insufficient_scope']]) {
  test(`client preserves stable ${status} API errors`, async () => {
    const client = new NasDashExternalApiClient({
      baseUrl: 'https://nasdash.example.test',
      apiKey: key,
      fetchImpl: async () => jsonResponse({
        error: { code, message: status === 403 ? `Request rejected: ${key}` : 'Request rejected.' },
        requestId: '00000000-0000-4000-8000-000000000000',
      }, { status }),
    });
    await assert.rejects(client.health(), error => {
      assert.ok(error instanceof NasDashApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(String(error).includes(key), false);
      if (status === 403) assert.match(error.message, /\[redacted\]/);
      return true;
    });
  });
}

test('client validates pagination and URL-encodes device identifiers', async () => {
  const urls = [];
  const client = new NasDashExternalApiClient({
    baseUrl: 'https://nasdash.example.test',
    apiKey: key,
    fetchImpl: async url => {
      urls.push(String(url));
      return jsonResponse({});
    },
  });

  await client.devices({ page: 2, limit: 25 });
  await client.metrics('device/with spaces');
  assert.equal(urls[0], 'https://nasdash.example.test/api/v1/external/devices?page=2&limit=25');
  assert.equal(urls[1], 'https://nasdash.example.test/api/v1/external/devices/device%2Fwith%20spaces/metrics');
  assert.throws(() => client.services({ limit: 101 }), /between 1 and 100/);
});
