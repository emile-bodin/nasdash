import { pathToFileURL } from 'node:url';

const EXTERNAL_API_PATH = '/api/v1/external/';
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(value) {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('NASDASH_URL must use HTTPS outside localhost.');
  }
  url.pathname = EXTERNAL_API_PATH;
  url.search = '';
  url.hash = '';
  return url;
}

function positiveInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || (maximum && value > maximum)) {
    throw new TypeError(`${name} must be an integer between 1 and ${maximum ?? '∞'}.`);
  }
  return value;
}

export class NasDashApiError extends Error {
  constructor(message, { status, code = 'request_failed', requestId = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'NasDashApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

export class NasDashExternalApiClient {
  constructor({ baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) {
    if (typeof apiKey !== 'string' || !/^ndk_[A-Za-z0-9_-]+$/.test(apiKey)) {
      throw new Error('NASDASH_API_KEY must be an ndk_ API key.');
    }
    if (typeof fetchImpl !== 'function') throw new Error('A Fetch API implementation is required.');
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.timeoutMs = positiveInteger(timeoutMs, 'timeoutMs');
    this.fetchImpl = fetchImpl;
  }

  async request(path, search = {}) {
    const url = new URL(path.replace(/^\/+/, ''), this.baseUrl);
    for (const [name, value] of Object.entries(search)) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new NasDashApiError(timedOut ? 'NasDash request timed out.' : 'NasDash request failed.');
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new NasDashApiError('NasDash returned an invalid JSON response.', {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      });
    }

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const remoteMessage = typeof body?.error?.message === 'string'
        ? body.error.message.replaceAll(this.apiKey, '[redacted]').slice(0, 300)
        : null;
      throw new NasDashApiError(remoteMessage || `NasDash returned HTTP ${response.status}.`, {
        status: response.status,
        code: body?.error?.code,
        requestId: body?.requestId || response.headers.get('x-request-id'),
        retryAfter: retryAfter ? Number.parseInt(retryAfter, 10) : null,
      });
    }
    return body;
  }

  health() { return this.request('health'); }
  me() { return this.request('me'); }
  services({ page = 1, limit = 50 } = {}) {
    return this.request('services', {
      page: positiveInteger(page, 'page'),
      limit: positiveInteger(limit, 'limit', 100),
    });
  }
  devices({ page = 1, limit = 50 } = {}) {
    return this.request('devices', {
      page: positiveInteger(page, 'page'),
      limit: positiveInteger(limit, 'limit', 100),
    });
  }
  metrics(deviceId) {
    if (typeof deviceId !== 'string' || !deviceId.trim()) throw new Error('A device ID is required.');
    return this.request(`devices/${encodeURIComponent(deviceId)}/metrics`);
  }
}

function usage() {
  return 'Usage: node examples/external-api-client.mjs <health|me|services|devices|metrics> [device-id]';
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const [command, argument] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return 0;
  }
  const client = new NasDashExternalApiClient({
    baseUrl: env.NASDASH_URL || 'http://127.0.0.1:2514',
    apiKey: env.NASDASH_API_KEY,
  });
  const operations = {
    health: () => client.health(),
    me: () => client.me(),
    services: () => client.services(),
    devices: () => client.devices(),
    metrics: () => client.metrics(argument),
  };
  if (!operations[command]) throw new Error(usage());
  console.log(JSON.stringify(await operations[command](), null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    if (error instanceof NasDashApiError) {
      const retry = error.retryAfter ? ` Retry after ${error.retryAfter}s.` : '';
      const request = error.requestId ? ` Request ID: ${error.requestId}.` : '';
      console.error(`NasDash API error (${error.code}): ${error.message}${retry}${request}`);
    } else {
      console.error(error instanceof Error ? error.message : 'Unexpected client error.');
    }
    process.exitCode = 1;
  });
}
