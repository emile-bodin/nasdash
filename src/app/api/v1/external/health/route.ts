import { NextRequest } from 'next/server';
import { externalApiOptions, externalApiRequest } from '@/lib/externalApi';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return externalApiRequest(request, 'read:health', () => ({
    body: { status: 'ok', apiVersion: 'v1', time: new Date().toISOString() },
  }));
}

export const OPTIONS = externalApiOptions;
