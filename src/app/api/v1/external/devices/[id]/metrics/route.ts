import { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { externalApiOptions, externalApiRequest } from '@/lib/externalApi';
import { externalDeviceMetrics } from '@/lib/externalApiDtos';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, segment: { params: Promise<{ id: string }> }) {
  return externalApiRequest(request, 'read:metrics', async ({ requestId }) => {
    const { id } = await segment.params;
    if (!(readConfig().devices ?? []).some(device => device.id === id)) {
      return {
        status: 404,
        body: {
          error: { code: 'device_not_found', message: 'The requested device does not exist.' },
          requestId,
        },
      };
    }
    return { body: { deviceId: id, ...externalDeviceMetrics(id) } };
  });
}

export const OPTIONS = externalApiOptions;
