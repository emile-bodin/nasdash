import { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { externalApiOptions, externalApiRequest, paginated } from '@/lib/externalApi';
import { externalServices } from '@/lib/externalApiDtos';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return externalApiRequest(request, 'read:services', () => ({ body: paginated(externalServices(readConfig()), request) }));
}

export const OPTIONS = externalApiOptions;
