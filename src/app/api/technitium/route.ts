import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { findInstance } from '@/integrations/instances';
import { getDeviceIntegration } from '@/integrations/registry';
import { sourceInput } from '@/integrations/sources';
import { technitiumSnapshot, type TechnitiumStatsRange } from '@/integrations/technitium/collect';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Prefer the saved integration. The environment variables are retained only
  // as a backwards-compatible fallback for older dev deployments.
  const config = readConfig();
  const instance = findInstance(config, 'technitium');
  const manifest = getDeviceIntegration('technitium');
  const savedConnection = instance && manifest
    ? manifest.connect(sourceInput(instance, undefined))
    : undefined;
  const url = savedConnection?.url?.trim() || process.env.NASDASH_TECHNITIUM_URL?.trim();
  const token = savedConnection?.token?.trim() || process.env.NASDASH_TECHNITIUM_TOKEN?.trim();
  const requestedRange = request.nextUrl.searchParams.get('range');
  const requestedNode = request.nextUrl.searchParams.get('node')?.trim() || 'cluster';
  const validRanges: TechnitiumStatsRange[] = ['hour', 'day', 'week', 'month', 'year', 'all'];
  const range = validRanges.includes(requestedRange as TechnitiumStatsRange)
    ? requestedRange as TechnitiumStatsRange
    : 'hour';
  if (!url) return NextResponse.json({ error: 'Technitium URL is not configured.' }, { status: 503 });
  try {
    let snapshot = await technitiumSnapshot({ url, token, target: requestedNode }, range);
    // A standalone Technitium server does not understand the cluster selector.
    // Keep the default cluster scope safe for both standalone and clustered setups.
    if (!snapshot.online && requestedNode === 'cluster') snapshot = await technitiumSnapshot({ url, token }, range);
    return NextResponse.json({ ...snapshot, range }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Technitium request failed.' }, { status: 502 });
  }
}
