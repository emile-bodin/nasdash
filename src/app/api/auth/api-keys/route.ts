import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/demoMode';
import {
  EXTERNAL_API_SCOPES,
  createExternalApiKey,
  listExternalApiKeys,
  revokeExternalApiKey,
  type ExternalApiScope,
} from '@/lib/externalApiKeys';
import { RequestValidationError, assertSafeIdentifier, readJsonObject, readString, readStringArray } from '@/lib/requestValidation';

const MAX_BODY_BYTES = 16 * 1024;

export function GET(request: NextRequest) {
  const authError = checkAdmin(request);
  if (authError) return authError;
  return NextResponse.json(listExternalApiKeys(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return NextResponse.json({ error: 'API key management is disabled in demo mode.' }, { status: 403 });
  const authError = checkAdmin(request);
  if (authError) return authError;
  try {
    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const name = readString(body, 'name', { required: true, maxLength: 100 })!;
    const scopes = readStringArray(body, 'scopes', { maxItems: EXTERNAL_API_SCOPES.length, maxItemLength: 64 }) || [];
    if (scopes.length === 0 || scopes.some(scope => !EXTERNAL_API_SCOPES.includes(scope as ExternalApiScope))) {
      throw new RequestValidationError('Select at least one valid API scope.');
    }
    const expiresAt = readString(body, 'expiresAt', { maxLength: 64 });
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
      throw new RequestValidationError('The API key expiry must be a future ISO date.');
    }
    const created = createExternalApiKey({ name, scopes: scopes as ExternalApiScope[], expiresAt });
    return NextResponse.json(created, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[NASDASH] API key creation failed.', error);
    return NextResponse.json({ error: 'Unable to create the API key.' }, { status: 500 });
  }
}

export function DELETE(request: NextRequest) {
  if (isDemoMode()) return NextResponse.json({ error: 'API key management is disabled in demo mode.' }, { status: 403 });
  const authError = checkAdmin(request);
  if (authError) return authError;
  try {
    const id = assertSafeIdentifier(new URL(request.url).searchParams.get('id') || '', 'identifier');
    if (!revokeExternalApiKey(id)) return NextResponse.json({ error: 'API key not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[NASDASH] API key revocation failed.', error);
    return NextResponse.json({ error: 'Unable to revoke the API key.' }, { status: 500 });
  }
}
