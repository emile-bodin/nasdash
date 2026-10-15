import { describe, expect, it } from 'vitest';
import { EXTERNAL_API_SCOPES } from './externalApiKeys';
import { externalOpenApiDocument } from './externalOpenApi';

describe('external OpenAPI document', () => {
  it('documents every external route, scope, DTO, and stable error response', () => {
    expect(Object.keys(externalOpenApiDocument.paths).sort()).toEqual([
      '/devices', '/devices/{id}/metrics', '/health', '/me', '/openapi.json', '/services',
    ]);
    expect(externalOpenApiDocument.components.schemas.Scope.enum).toEqual(EXTERNAL_API_SCOPES);
    expect(externalOpenApiDocument.components.schemas).toMatchObject({
      Health: {}, ServicePage: {}, DevicePage: {}, DeviceMetrics: {}, DeviceVitals: {}, ApiKeyIdentity: {}, Error: {},
    });
    for (const path of Object.values(externalOpenApiDocument.paths)) {
      expect(path.get.responses).toHaveProperty('401');
      expect(path.get.responses).toHaveProperty('429');
    }
  });

  it('contains no mutating operations or references to internal configuration', () => {
    const serialized = JSON.stringify(externalOpenApiDocument);
    expect(serialized).not.toMatch(/"post"|"put"|"patch"|"delete"/i);
    expect(serialized).not.toMatch(/password|docker action|integration secret|backup/i);
  });
});
