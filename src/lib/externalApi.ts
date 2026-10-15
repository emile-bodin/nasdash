import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateExternalApiKey, type ExternalApiKeyRecord, type ExternalApiScope } from './externalApiKeys';
import { getDataPath } from './dataDirectory';

type ExternalResult = { body: unknown; status?: number };

interface ExternalApiContext {
  key: ExternalApiKeyRecord;
  requestId: string;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const state = globalThis as typeof globalThis & { __externalApiRateLimits?: Map<string, RateBucket> };
state.__externalApiRateLimits ??= new Map<string, RateBucket>();
const rateLimits = state.__externalApiRateLimits;
const AUDIT_PATH = getDataPath('external-api-audit.jsonl');
const MAX_AUDIT_BYTES = 5 * 1024 * 1024;

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

function clientIp(request: NextRequest): string {
  if (process.env.NASDASH_TRUST_PROXY === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded.slice(0, 128);
    const real = request.headers.get('x-real-ip')?.trim();
    if (real) return real.slice(0, 128);
  }
  return 'direct';
}

function consumeLimit(id: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (rateLimits.size > 5_000) {
    for (const [bucketId, bucket] of rateLimits) {
      if (bucket.resetAt <= now) rateLimits.delete(bucketId);
    }
    while (rateLimits.size > 5_000) {
      const oldest = rateLimits.keys().next().value;
      if (typeof oldest !== 'string') break;
      rateLimits.delete(oldest);
    }
  }
  const existing = rateLimits.get(id);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + 60_000 }
    : existing;
  bucket.count += 1;
  rateLimits.set(id, bucket);
  return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

function allowedOrigin(request: NextRequest): string | null | false {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = (process.env.NASDASH_EXTERNAL_API_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : false;
}

function isSecureExternalRequest(request: NextRequest): boolean {
  if (process.env.NASDASH_EXTERNAL_API_ALLOW_INSECURE_HTTP === 'true') return true;
  try {
    if (new URL(request.url).protocol === 'https:') return true;
  } catch {}
  return process.env.NASDASH_TRUST_PROXY === 'true'
    && request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() === 'https';
}

function headers(requestId: string, origin: string | null): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    } : {}),
  };
}

function errorResponse(requestId: string, origin: string | null, status: number, code: string, message: string, retryAfter?: number) {
  return NextResponse.json(
    { error: { code, message }, requestId },
    { status, headers: { ...headers(requestId, origin), ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } },
  );
}

function audit(request: NextRequest, requestId: string, status: number, keyId?: string): void {
  try {
    fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
    if (fs.existsSync(AUDIT_PATH) && fs.statSync(AUDIT_PATH).size >= MAX_AUDIT_BYTES) {
      const previous = `${AUDIT_PATH}.1`;
      try { if (fs.existsSync(previous)) fs.unlinkSync(previous); } catch {}
      fs.renameSync(AUDIT_PATH, previous);
    }
    const userAgent = request.headers.get('user-agent') || '';
    const record = {
      timestamp: new Date().toISOString(),
      requestId,
      keyId: keyId ?? null,
      method: request.method,
      path: new URL(request.url).pathname,
      status,
      clientIp: clientIp(request),
      // Hash client-controlled metadata so an attacker cannot make a secret
      // appear in the audit log while requests remain correlatable.
      userAgentHash: userAgent
        ? crypto.createHash('sha256').update(userAgent).digest('hex').slice(0, 24)
        : null,
    };
    fs.appendFileSync(AUDIT_PATH, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('[NASDASH] External API audit write failed.', error);
  }
}

export async function externalApiRequest(
  request: NextRequest,
  requiredScope: ExternalApiScope | null,
  handler: (context: ExternalApiContext) => Promise<ExternalResult> | ExternalResult,
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const origin = allowedOrigin(request);
  let keyId: string | undefined;
  let response: NextResponse;
  try {
    if (origin === false) {
      response = errorResponse(requestId, null, 403, 'origin_not_allowed', 'The request origin is not allowed.');
    } else if (!isSecureExternalRequest(request)) {
      response = errorResponse(requestId, origin, 426, 'https_required', 'HTTPS is required.');
    } else {
      const url = new URL(request.url);
      if (['api_key', 'apiKey', 'token', 'key'].some(name => url.searchParams.has(name))) {
        response = errorResponse(requestId, origin, 400, 'credential_in_query', 'API credentials must use the Authorization header.');
      } else {
        const ipLimit = consumeLimit(`ip:${clientIp(request)}`, positiveInt(process.env.NASDASH_EXTERNAL_API_IP_LIMIT, 60));
        if (!ipLimit.allowed) {
          response = errorResponse(requestId, origin, 429, 'rate_limited', 'Too many requests.', ipLimit.retryAfter);
        } else {
          const authorization = request.headers.get('authorization') || '';
          const match = /^Bearer (ndk_[A-Za-z0-9_-]+)$/.exec(authorization);
          const key = match ? authenticateExternalApiKey(match[1]) : null;
          keyId = key?.id;
          if (!key) {
            response = errorResponse(requestId, origin, 401, 'invalid_api_key', 'A valid API key is required.');
          } else {
            const keyLimit = consumeLimit(`key:${key.id}`, positiveInt(process.env.NASDASH_EXTERNAL_API_KEY_LIMIT, 120));
            if (!keyLimit.allowed) {
              response = errorResponse(requestId, origin, 429, 'rate_limited', 'Too many requests.', keyLimit.retryAfter);
            } else if (requiredScope && !key.scopes.includes(requiredScope)) {
              response = errorResponse(requestId, origin, 403, 'insufficient_scope', `The ${requiredScope} scope is required.`);
            } else {
              const result = await handler({ key, requestId });
              response = NextResponse.json(result.body, { status: result.status ?? 200, headers: headers(requestId, origin) });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[NASDASH] External API request ${requestId} failed.`, error instanceof Error ? error.message : 'Unknown error');
    response = errorResponse(requestId, origin === false ? null : origin, 500, 'internal_error', 'The request could not be completed.');
  }
  audit(request, requestId, response.status, keyId);
  return response;
}

export function externalApiOptions(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const origin = allowedOrigin(request);
  if (origin === false || origin === null) {
    const response = errorResponse(requestId, null, 403, 'origin_not_allowed', 'The request origin is not allowed.');
    audit(request, requestId, response.status);
    return response;
  }
  const response = new NextResponse(null, { status: 204, headers: headers(requestId, origin) });
  audit(request, requestId, response.status);
  return response;
}

export function paginated<T>(items: T[], request: NextRequest) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), meta: { page, limit, total: items.length } };
}

export function resetExternalApiRateLimitsForTests(): void {
  rateLimits.clear();
}
