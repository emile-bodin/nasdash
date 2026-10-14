import { describe, expect, it } from 'vitest';
import { addPortItemToList, type ActivePortItem } from './portAggregation';

const item = (overrides: Partial<ActivePortItem>): ActivePortItem => ({
  port: 8181,
  serviceName: 'Nginx Proxy Manager',
  ip: '192.168.86.70',
  source: 'Service NasDash (Core Infrastructure)',
  type: 'HTTP',
  ...overrides,
});

describe('addPortItemToList', () => {
  it('collapses a Docker discovery row into the curated service entry', () => {
    const ports: ActivePortItem[] = [];
    addPortItemToList(ports, item({ ip: '192.168.86.70' }));
    addPortItemToList(ports, item({
      serviceName: 'nginx-proxy-manager-npm-1',
      ip: 'localhost',
      source: 'Conteneur Docker (Docker host)',
      status: 'running',
    }));

    expect(ports).toHaveLength(1);
    expect(ports[0].serviceName).toBe('Nginx Proxy Manager');
    expect(ports[0].source).toContain('Service NasDash');
  });

  it('prefers the service when Docker discovery is processed first', () => {
    const ports: ActivePortItem[] = [];
    addPortItemToList(ports, item({
      serviceName: 'nginx-proxy-manager-npm-1',
      ip: 'localhost',
      source: 'Conteneur Docker (Docker host)',
      status: 'running',
    }));
    addPortItemToList(ports, item({ ip: '192.168.86.70' }));

    expect(ports).toHaveLength(1);
    expect(ports[0].serviceName).toBe('Nginx Proxy Manager');
    expect(ports[0].ip).toBe('192.168.86.70');
  });

  it('keeps independent NasDash services on the same port', () => {
    const ports: ActivePortItem[] = [];
    addPortItemToList(ports, item({ serviceName: 'Service A' }));
    addPortItemToList(ports, item({ serviceName: 'Service B' }));

    expect(ports).toHaveLength(2);
  });
});
