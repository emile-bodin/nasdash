import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { findInstance } from '@/integrations/instances';
import { getDeviceIntegration } from '@/integrations/registry';
import { sourceInput } from '@/integrations/sources';
import { technitiumNodes } from '@/integrations/technitium/collect';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = readConfig();
  const instance = findInstance(config, 'technitium');
  const manifest = getDeviceIntegration('technitium');
  const savedConnection = instance && manifest ? manifest.connect(sourceInput(instance, undefined)) : undefined;
  const url = savedConnection?.url?.trim() || process.env.NASDASH_TECHNITIUM_URL?.trim();
  const token = savedConnection?.token?.trim() || process.env.NASDASH_TECHNITIUM_TOKEN?.trim();
  if (!url) return NextResponse.json({ clusterInitialized: false, nodes: [] });
  try {
    return NextResponse.json(await technitiumNodes({ url, token }), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ clusterInitialized: false, nodes: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
