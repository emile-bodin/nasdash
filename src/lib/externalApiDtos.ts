import type { DashboardConfig } from './types';
import { devicesStatusCache } from '@/integrations/runtime';
import type { DeviceVitals } from '@/integrations/types';

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function externalVitals(vitals: DeviceVitals | undefined) {
  if (!vitals) return {};
  const load = Array.isArray(vitals.load) ? vitals.load.slice(0, 3).map(finite) : [];
  const uptimeSeconds = finite(vitals.uptimeSeconds);
  const logicalCores = finite(vitals.cores);
  const receiveBytesPerSecond = finite(vitals.netRxBps);
  const transmitBytesPerSecond = finite(vitals.netTxBps);
  const totalBytesPerSecond = finite(vitals.netTotalBps);
  const hasNetwork = receiveBytesPerSecond !== undefined
    || transmitBytesPerSecond !== undefined
    || totalBytesPerSecond !== undefined;

  return {
    ...(uptimeSeconds !== undefined ? { uptimeSeconds } : {}),
    ...(logicalCores !== undefined ? { logicalCores } : {}),
    ...(load[0] !== undefined ? {
      loadAverage: {
        oneMinute: load[0],
        ...(load[1] !== undefined ? { fiveMinutes: load[1] } : {}),
        ...(load[2] !== undefined ? { fifteenMinutes: load[2] } : {}),
      },
    } : {}),
    ...(hasNetwork ? {
      network: {
        ...(receiveBytesPerSecond !== undefined ? { receiveBytesPerSecond } : {}),
        ...(transmitBytesPerSecond !== undefined ? { transmitBytesPerSecond } : {}),
        ...(totalBytesPerSecond !== undefined ? { totalBytesPerSecond } : {}),
      },
    } : {}),
  };
}

export function externalServices(config: Pick<DashboardConfig, 'categories'>) {
  return (config.categories ?? [])
    .filter(category => category.isSecret !== true)
    .map(category => ({
      id: category.id,
      name: category.title,
      services: category.services.map(service => ({ id: service.id, name: service.name })),
    }));
}

export function externalDevices(config: Pick<DashboardConfig, 'devices'>) {
  return (config.devices ?? []).map(device => {
    const status = devicesStatusCache[device.id];
    return {
      id: device.id,
      name: device.name,
      icon: device.icon,
      online: status?.online ?? null,
      updatedAt: status?.updatedAt ? new Date(status.updatedAt).toISOString() : null,
    };
  });
}

export function externalDeviceMetrics(deviceId: string) {
  const status = devicesStatusCache[deviceId];
  if (!status) return { status: 'pending' as const, updatedAt: null, metrics: [], vitals: {} };
  if (!status.online) {
    return {
      status: 'offline' as const,
      updatedAt: new Date(status.updatedAt).toISOString(),
      metrics: [],
      vitals: {},
    };
  }
  const metrics = (status.metrics ?? []).map(metric => ({
    key: metric.key,
    kind: metric.kind,
    ...(metric.name ? { name: metric.name } : {}),
    percent: finite(metric.percent) ?? 0,
    ...(finite(metric.totalBytes) !== undefined ? { totalBytes: finite(metric.totalBytes) } : {}),
    ...(finite(metric.usedBytes) !== undefined ? { usedBytes: finite(metric.usedBytes) } : {}),
    ...(finite(metric.temperatureC) !== undefined ? { temperatureC: finite(metric.temperatureC) } : {}),
  }));
  return {
    status: 'online' as const,
    updatedAt: new Date(status.updatedAt).toISOString(),
    metrics,
    vitals: externalVitals(status.vitals),
  };
}
