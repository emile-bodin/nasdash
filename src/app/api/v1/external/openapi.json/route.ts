import { NextRequest } from 'next/server';
import { externalApiOptions, externalApiRequest } from '@/lib/externalApi';
import { externalOpenApiDocument } from '@/lib/externalOpenApi';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return externalApiRequest(request, 'read:health', () => ({ body: externalOpenApiDocument }));
}

export const OPTIONS = externalApiOptions;
