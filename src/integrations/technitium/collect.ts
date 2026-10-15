import { collectorFailure } from '../errors';
import { MonitoringConfigurationError, MonitoringHttpError, MonitoringInvalidResponseError } from '@/lib/monitoringError';
import { httpGet } from '../http';
import { CollectError, type CollectResult, type DeviceCollector, type DeviceVitals, type ResolvedConnection } from '../types';

export interface TechnitiumCounters {
  totalQueries?: number;
  totalNoError?: number;
  totalServerFailure?: number;
  totalNxDomain?: number;
  totalRefused?: number;
  totalAuthoritative?: number;
  totalRecursive?: number;
  totalCached?: number;
  totalBlocked?: number;
  totalDropped?: number;
  totalClients?: number;
}

export interface TechnitiumStats {
  stats?: TechnitiumCounters & {
    zones?: number;
    cachedEntries?: number;
    allowedZones?: number;
    blockedZones?: number;
    allowListZones?: number;
    blockListZones?: number;
  };
  mainChartData?: { labels?: string[]; datasets?: Array<{ label?: string; data?: number[] }> };
}

export type TechnitiumStatsRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

const TECHNITIUM_RANGE_TYPES: Record<Exclude<TechnitiumStatsRange, 'all'>, string> = {
  hour: 'LastHour',
  day: 'LastDay',
  week: 'LastWeek',
  month: 'LastMonth',
  year: 'LastYear',
};

export interface TechnitiumSnapshot {
  online: boolean;
  server?: string;
  uptimeSeconds?: number;
  counters?: TechnitiumCounters;
  stats?: TechnitiumStats['stats'];
  chart?: TechnitiumStats['mainChartData'];
}

type MetricsResponse = { response?: { uptimeSeconds?: number; lifetimeCounters?: TechnitiumCounters }; server?: string; status?: string };
type StatsResponse = { response?: TechnitiumStats; status?: string };
export interface TechnitiumNode { name: string; type?: string; state?: string; }
type ClusterResponse = { response?: { clusterInitialized?: boolean; dnsServerDomain?: string; clusterNodes?: TechnitiumNode[] }; server?: string; status?: string };

function apiUrl(connection: ResolvedConnection, path: string): string {
  if (!connection.url) throw new CollectError('integrations.error.missingUrl', new MonitoringConfigurationError('Missing Technitium URL.'), false, { service: 'Technitium DNS' });
  return `${connection.url.replace(/\/$/, '')}${path}`;
}

async function getJson<T>(url: string, token: string | undefined): Promise<T> {
  let response;
  try {
    response = await httpGet(url, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      allowSelfSigned: true,
    });
  } catch (error) {
    throw collectorFailure('Technitium DNS', error);
  }
  if (!response.ok) throw collectorFailure('Technitium DNS', new MonitoringHttpError('Technitium DNS', response.status, response.statusText));
  try {
    return JSON.parse(await response.text()) as T;
  } catch {
    throw new CollectError('integrations.invalidResponse', new MonitoringInvalidResponseError(`Non-JSON response from ${url}.`));
  }
}

export async function technitiumSnapshot(connection: ResolvedConnection, range: TechnitiumStatsRange = 'hour'): Promise<TechnitiumSnapshot> {
  const node = connection.target ? `&node=${encodeURIComponent(connection.target)}` : '';
  const metrics = await getJson<MetricsResponse>(apiUrl(connection, `/api/dashboard/metrics/json?${node.slice(1)}`.replace(/\?$/, '')), connection.token);
  const lifetime = metrics.response?.lifetimeCounters;
  if (range === 'all') {
    return {
      online: metrics.status === 'ok',
      server: metrics.server,
      uptimeSeconds: metrics.response?.uptimeSeconds,
      counters: lifetime,
      stats: lifetime,
    };
  }
  const stats = await getJson<StatsResponse>(apiUrl(connection, `/api/dashboard/stats/get?type=${TECHNITIUM_RANGE_TYPES[range]}&utc=true${node}`), connection.token);
  return {
    online: metrics.status === 'ok' && stats.status === 'ok',
    server: metrics.server,
    uptimeSeconds: metrics.response?.uptimeSeconds,
    counters: lifetime,
    stats: stats.response?.stats,
    chart: stats.response?.mainChartData,
  };
}

export const collectTechnitium: DeviceCollector = async connection => {
  const snapshot = await technitiumSnapshot(connection);
  if (!snapshot.online) throw new CollectError('integrations.invalidResponse', new MonitoringInvalidResponseError('Technitium returned an unsuccessful response.'));
  const vitals: DeviceVitals = {};
  if (snapshot.uptimeSeconds !== undefined) vitals.uptimeSeconds = Math.round(snapshot.uptimeSeconds);
  // DNS counters are exposed by the dedicated Technitium widget. The device
  // integration still reports online state and uptime without inventing CPU or memory gauges.
  const result: CollectResult = { metrics: [], vitals };
  return result;
};

export async function technitiumNodes(connection: ResolvedConnection): Promise<{ currentNode?: string; clusterInitialized: boolean; nodes: TechnitiumNode[] }> {
  const metrics = await getJson<MetricsResponse>(apiUrl(connection, '/api/dashboard/metrics/json'), connection.token);
  try {
    const cluster = await getJson<ClusterResponse>(apiUrl(connection, '/api/admin/cluster/state?includeServerIpAddresses=false'), connection.token);
    return {
      currentNode: cluster.response?.dnsServerDomain || metrics.server,
      clusterInitialized: cluster.response?.clusterInitialized === true,
      nodes: cluster.response?.clusterNodes?.filter(node => node.name) ?? [],
    };
  } catch {
    return { currentNode: metrics.server, clusterInitialized: false, nodes: [] };
  }
}
