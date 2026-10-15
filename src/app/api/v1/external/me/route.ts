import { NextRequest } from 'next/server';
import { externalApiOptions, externalApiRequest } from '@/lib/externalApi';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return externalApiRequest(request, null, ({ key }) => ({
    body: {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt ?? null,
    },
  }));
}

export const OPTIONS = externalApiOptions;
