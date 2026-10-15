import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { devicesStatusCache } from '@/integrations/runtime';
import { externalDeviceMetrics, externalDevices, externalServices } from './externalApiDtos';
import { externalOpenApiDocument } from './externalOpenApi';

type Schema = Record<string, unknown>;
const schemas = externalOpenApiDocument.components.schemas as unknown as Record<string, Schema>;

function resolved(schema: Schema): Schema {
  const reference = schema.$ref;
  if (typeof reference !== 'string') return schema;
  const name = reference.match(/^#\/components\/schemas\/(.+)$/)?.[1];
  if (!name || !schemas[name]) throw new Error(`Unknown schema reference: ${reference}`);
  return resolved(schemas[name]);
}

function validate(schemaInput: Schema, value: unknown, location = '$'): void {
  const schema = resolved(schemaInput);
  if ('const' in schema) expect(value, location).toBe(schema.const);
  if (Array.isArray(schema.enum)) expect(schema.enum, location).toContain(value);

  const types = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (types.length > 0) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const compatible = types.includes(actual)
      || (types.includes('integer') && actual === 'number' && Number.isInteger(value));
    expect(compatible, `${location} should be ${types.join(' or ')}, received ${actual}`).toBe(true);
  }

  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number') expect(value.length, location).toBeGreaterThanOrEqual(schema.minLength);
    if (schema.format === 'date-time') expect(Number.isNaN(Date.parse(value)), location).toBe(false);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number') expect(value, location).toBeGreaterThanOrEqual(schema.minimum);
    if (typeof schema.maximum === 'number') expect(value, location).toBeLessThanOrEqual(schema.maximum);
  }
  if (Array.isArray(value)) {
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => validate(schema.items as Schema, item, `${location}[${index}]`));
    }
    return;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const required of (schema.required ?? []) as string[]) {
      expect(Object.hasOwn(object, required), `${location}.${required} is required`).toBe(true);
    }
    if (schema.additionalProperties === false) {
      expect(Object.keys(object).filter(key => !Object.hasOwn(properties, key)), `${location} has undocumented fields`).toEqual([]);
    }
    for (const [key, nested] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) validate(nested, object[key], `${location}.${key}`);
    }
  }
}

afterEach(() => {
  for (const id of Object.keys(devicesStatusCache)) delete devicesStatusCache[id];
});

describe('external API contract', () => {
  it('has one implemented route for every documented operation', () => {
    for (const documentedPath of Object.keys(externalOpenApiDocument.paths)) {
      const routePath = documentedPath
        .replace(/\{([^}]+)\}/g, '[$1]')
        .replace(/^\//, '');
      expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/v1/external', routePath, 'route.ts')), documentedPath).toBe(true);
    }
  });

  it('validates real service and device DTO output against OpenAPI schemas', () => {
    devicesStatusCache.nas = {
      online: true,
      updatedAt: Date.parse('2026-10-15T08:00:00.000Z'),
      metrics: [{ key: 'cpu.usage', kind: 'cpu', percent: 37.5, temperatureC: 54 }],
      vitals: { uptimeSeconds: 7200, cores: 4, load: [0.3, 0.2, 0.1], netRxBps: 1024, netTxBps: 512 },
    };
    const services = externalServices({ categories: [{
      id: 'infra', title: 'Infrastructure', emoji: 'I', order: 0,
      services: [{ id: 'nasdash', name: 'NasDash', logo: '/secret.svg', localUrl: 'https://10.0.0.2' }],
    }] });
    const devices = externalDevices({ devices: [{
      id: 'nas', name: 'NAS', icon: 'server', host: '10.0.0.2',
      api: { type: 'glances', url: 'https://10.0.0.2', token: 'must-not-leak' },
    }] });
    const metrics = { deviceId: 'nas', ...externalDeviceMetrics('nas') };

    validate(schemas.ServicePage, { data: services, meta: { page: 1, limit: 50, total: services.length } });
    validate(schemas.DevicePage, { data: devices, meta: { page: 1, limit: 50, total: devices.length } });
    validate(schemas.DeviceMetrics, metrics);
    expect(JSON.stringify({ services, devices, metrics })).not.toMatch(/10\.0\.0\.2|must-not-leak|secret\.svg/);
  });

  it('validates health, identity, and error envelopes against OpenAPI schemas', () => {
    validate(schemas.Health, { status: 'ok', apiVersion: 'v1', time: '2026-10-15T08:00:00.000Z' });
    validate(schemas.ApiKeyIdentity, {
      id: '00000000-0000-4000-8000-000000000000', name: 'automation', prefix: 'ndk_abcd',
      scopes: ['read:health', 'read:devices'], createdAt: '2026-10-15T08:00:00.000Z', expiresAt: null,
    });
    validate(schemas.Error, {
      error: { code: 'rate_limited', message: 'Too many requests.' },
      requestId: '00000000-0000-4000-8000-000000000000',
    });
  });

  it('keeps operation IDs unique and every operation read-only and authenticated', () => {
    const operations = Object.values(externalOpenApiDocument.paths).map(pathItem => pathItem.get);
    expect(new Set(operations.map(operation => operation.operationId)).size).toBe(operations.length);
    expect(externalOpenApiDocument.security).toEqual([{ bearerAuth: [] }]);
    expect(JSON.stringify(externalOpenApiDocument.paths)).not.toMatch(/"(post|put|patch|delete)"/i);
  });
});
