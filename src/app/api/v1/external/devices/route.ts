import { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { externalApiOptions, externalApiRequest, paginated } from '@/lib/externalApi';
import { externalDevices } from '@/lib/externalApiDtos';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return externalApiRequest(request, 'read:devices', () => ({ body: paginated(externalDevices(readConfig()), request) }));
}

export const OPTIONS = externalApiOptions;
