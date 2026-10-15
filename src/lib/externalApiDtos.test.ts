import { afterEach, describe, expect, it } from 'vitest';
import { devicesStatusCache } from '@/integrations/runtime';
import { externalDeviceMetrics, externalDevices, externalServices } from './externalApiDtos';

afterEach(() => {
  for (const id of Object.keys(devicesStatusCache)) delete devicesStatusCache[id];
});

describe('external API DTOs', () => {
  it('exposes service identity without addresses, logos, or secret categories', () => {
    const result = externalServices({ categories: [
      { id: 'public', title: 'Public', emoji: 'P', order: 0, services: [{ id: 'svc', name: 'Media', logo: '/private/logo', localUrl: 'http://10.0.0.2', secondaryUrl: 'https://secret' }] },
      { id: 'secret', title: 'Secret', emoji: 'S', order: 1, isSecret: true, services: [{ id: 'hidden', name: 'Hidden', logo: '', localUrl: 'http://10.0.0.3' }] },
    ] });
    expect(result).toEqual([{ id: 'public', name: 'Public', services: [{ id: 'svc', name: 'Media' }] }]);
    expect(JSON.stringify(result)).not.toContain('10.0.0');
    expect(JSON.stringify(result)).not.toContain('/private/logo');
  });

  it('maps devices and numeric metrics without upstream errors or connection data', () => {
    devicesStatusCache.device = {
      online: true,
      updatedAt: Date.parse('2026-01-01T00:00:00.000Z'),
      error: 'upstream token leaked here',
      metrics: [{ key: 'cpu.usage', kind: 'cpu', percent: 42, temperatureC: 61 }],
      vitals: {
        uptimeSeconds: 12345,
        load: [0.5, 0.4, 0.3],
        cores: 8,
        netRxBps: 1024,
        netTxBps: 512,
      },
    };
    const devices = externalDevices({ devices: [{
      id: 'device', name: 'NAS', host: '10.0.0.2', icon: 'N',
      api: { type: 'glances', url: 'http://10.0.0.2', token: 'private-token' },
    }] });
    const metrics = externalDeviceMetrics('device');
    expect(devices).toEqual([{ id: 'device', name: 'NAS', icon: 'N', online: true, updatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(metrics).toMatchObject({
      status: 'online',
      metrics: [{ key: 'cpu.usage', kind: 'cpu', percent: 42, temperatureC: 61 }],
      vitals: {
        uptimeSeconds: 12345,
        logicalCores: 8,
        loadAverage: { oneMinute: 0.5, fiveMinutes: 0.4, fifteenMinutes: 0.3 },
        network: { receiveBytesPerSecond: 1024, transmitBytesPerSecond: 512 },
      },
    });
    expect(JSON.stringify({ devices, metrics })).not.toMatch(/10\.0\.0\.2|private-token|upstream token/);
  });
});
