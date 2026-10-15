import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nasdash-external-api-'));
process.env.NASDASH_DATA_DIR = dataDirectory;
process.env.VITEST = 'true';
process.env.NASDASH_EXTERNAL_API_ALLOW_INSECURE_HTTP = 'true';

const keys = await import('./externalApiKeys');
const api = await import('./externalApi');

describe('external API guard', () => {
  beforeEach(() => {
    keys.resetExternalApiKeysForTests();
    api.resetExternalApiRateLimitsForTests();
    delete process.env.NASDASH_EXTERNAL_API_ALLOWED_ORIGINS;
    delete process.env.NASDASH_EXTERNAL_API_IP_LIMIT;
    delete process.env.NASDASH_EXTERNAL_API_KEY_LIMIT;
  });
  afterAll(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

  it('does not accept a dashboard cookie as external authentication', async () => {
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: { cookie: 'nasdash_session=synthetic' } });
    const response = await api.externalApiRequest(request, 'read:health', () => ({ body: { status: 'ok' } }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_api_key');
  });

  it('does not accept an API key from a cookie', async () => {
    const created = keys.createExternalApiKey({ name: 'cookie', scopes: ['read:health'] });
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: { cookie: `api_key=${created.token}` } });
    const response = await api.externalApiRequest(request, 'read:health', () => ({ body: { status: 'ok' } }));
    expect(response.status).toBe(401);
  });

  it('enforces scopes and never returns the key secret', async () => {
    const created = keys.createExternalApiKey({ name: 'services', scopes: ['read:services'] });
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: { authorization: `Bearer ${created.token}` } });
    const response = await api.externalApiRequest(request, 'read:health', () => ({ body: { status: 'ok' } }));
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(created.token);
  });

  it('rejects credentials in query strings and unapproved browser origins', async () => {
    const queryRequest = new NextRequest('http://localhost/api/v1/external/health?api_key=synthetic');
    expect((await api.externalApiRequest(queryRequest, null, () => ({ body: {} }))).status).toBe(400);

    const originRequest = new NextRequest('http://localhost/api/v1/external/health', { headers: { origin: 'https://untrusted.example' } });
    expect((await api.externalApiRequest(originRequest, null, () => ({ body: {} }))).status).toBe(403);
  });

  it('allows only explicitly configured browser origins', async () => {
    process.env.NASDASH_EXTERNAL_API_ALLOWED_ORIGINS = 'https://app.example.test';
    const created = keys.createExternalApiKey({ name: 'browser', scopes: ['read:health'] });
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: {
      authorization: `Bearer ${created.token}`,
      origin: 'https://app.example.test',
    } });
    const response = await api.externalApiRequest(request, 'read:health', () => ({ body: { status: 'ok' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
  });

  it('requires HTTPS unless the development exception is enabled', async () => {
    delete process.env.NASDASH_EXTERNAL_API_ALLOW_INSECURE_HTTP;
    const response = await api.externalApiRequest(
      new NextRequest('http://localhost/api/v1/external/health'),
      null,
      () => ({ body: {} }),
    );
    expect(response.status).toBe(426);
    expect((await response.json()).error.code).toBe('https_required');
    process.env.NASDASH_EXTERNAL_API_ALLOW_INSECURE_HTTP = 'true';
  });

  it('applies an IP rate limit and emits request identifiers', async () => {
    process.env.NASDASH_EXTERNAL_API_IP_LIMIT = '1';
    const created = keys.createExternalApiKey({ name: 'health', scopes: ['read:health'] });
    const makeRequest = () => new NextRequest('http://localhost/api/v1/external/health', { headers: { authorization: `Bearer ${created.token}` } });
    const first = await api.externalApiRequest(makeRequest(), 'read:health', () => ({ body: { status: 'ok' } }));
    const second = await api.externalApiRequest(makeRequest(), 'read:health', () => ({ body: { status: 'ok' } }));
    expect(first.status).toBe(200);
    expect(first.headers.get('x-request-id')).toBeTruthy();
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBeTruthy();
  });

  it('applies a separate per-key rate limit', async () => {
    process.env.NASDASH_EXTERNAL_API_IP_LIMIT = '10';
    process.env.NASDASH_EXTERNAL_API_KEY_LIMIT = '1';
    const created = keys.createExternalApiKey({ name: 'limited', scopes: ['read:health'] });
    const makeRequest = () => new NextRequest('http://localhost/api/v1/external/health', { headers: { authorization: `Bearer ${created.token}` } });
    expect((await api.externalApiRequest(makeRequest(), 'read:health', () => ({ body: {} }))).status).toBe(200);
    const limited = await api.externalApiRequest(makeRequest(), 'read:health', () => ({ body: {} }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('writes audit events without logging client-provided secrets', async () => {
    const created = keys.createExternalApiKey({ name: 'audit', scopes: ['read:health'] });
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: {
      authorization: `Bearer ${created.token}`,
      'user-agent': `test-client ${created.token}`,
    } });
    const response = await api.externalApiRequest(request, 'read:health', () => ({ body: { status: 'ok' } }));
    const audit = fs.readFileSync(path.join(dataDirectory, 'external-api-audit.jsonl'), 'utf8');
    expect(audit).toContain(created.key.id);
    expect(audit).toContain(new URL(request.url).pathname);
    expect(audit).toContain(response.headers.get('x-request-id'));
    expect(audit).not.toContain(created.token);
    expect(audit).not.toContain('test-client');
  });

  it('returns a stable error without exposing handler details', async () => {
    const created = keys.createExternalApiKey({ name: 'failure', scopes: ['read:health'] });
    const request = new NextRequest('http://localhost/api/v1/external/health', { headers: { authorization: `Bearer ${created.token}` } });
    const response = await api.externalApiRequest(request, 'read:health', () => {
      throw new Error('/private/path upstream-token-value');
    });
    const body = JSON.stringify(await response.json());
    expect(response.status).toBe(500);
    expect(body).toContain('internal_error');
    expect(body).not.toContain('/private/path');
    expect(body).not.toContain('upstream-token-value');
  });
});
