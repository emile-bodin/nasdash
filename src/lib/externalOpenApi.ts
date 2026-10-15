const json = (schema: object, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const securedErrors = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '426': { $ref: '#/components/responses/HttpsRequired' },
  '429': { $ref: '#/components/responses/RateLimited' },
  '500': { $ref: '#/components/responses/InternalError' },
};

export const externalOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'NasDash External API',
    version: '1.1.0',
    description: 'Stable, read-only API for applications and AI tooling. Internal dashboard APIs are not part of this contract.',
  },
  servers: [{ url: '/api/v1/external' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'API health', operationId: 'getHealth', 'x-required-scope': 'read:health',
        responses: { '200': json({ $ref: '#/components/schemas/Health' }, 'Healthy'), ...securedErrors },
      },
    },
    '/services': {
      get: {
        summary: 'List public service names', operationId: 'listServices', 'x-required-scope': 'read:services',
        parameters: [{ $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/Limit' }],
        responses: { '200': json({ $ref: '#/components/schemas/ServicePage' }, 'Paginated service categories'), ...securedErrors },
      },
    },
    '/devices': {
      get: {
        summary: 'List devices and availability', operationId: 'listDevices', 'x-required-scope': 'read:devices',
        parameters: [{ $ref: '#/components/parameters/Page' }, { $ref: '#/components/parameters/Limit' }],
        responses: { '200': json({ $ref: '#/components/schemas/DevicePage' }, 'Paginated devices'), ...securedErrors },
      },
    },
    '/devices/{id}/metrics': {
      get: {
        summary: 'Read cached metrics for one device', operationId: 'getDeviceMetrics', 'x-required-scope': 'read:metrics',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1 } }],
        responses: {
          '200': json({ $ref: '#/components/schemas/DeviceMetrics' }, 'Device metrics'),
          '404': { $ref: '#/components/responses/NotFound' },
          ...securedErrors,
        },
      },
    },
    '/me': {
      get: {
        summary: 'Inspect the current API key', operationId: 'getCurrentApiKey',
        responses: { '200': json({ $ref: '#/components/schemas/ApiKeyIdentity' }, 'API key identity and scopes'), ...securedErrors },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'Read this OpenAPI document', operationId: 'getOpenApiDocument', 'x-required-scope': 'read:health',
        responses: { '200': json({ type: 'object' }, 'OpenAPI 3.1 document'), ...securedErrors },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http', scheme: 'bearer', bearerFormat: 'ndk_*',
        description: 'Use an admin-created API key in the Authorization header. Cookies and query-string credentials are not accepted.',
      },
    },
    parameters: {
      Page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      Limit: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
    },
    schemas: {
      Scope: { type: 'string', enum: ['read:health', 'read:services', 'read:devices', 'read:metrics'] },
      Pagination: {
        type: 'object', additionalProperties: false, required: ['page', 'limit', 'total'],
        properties: { page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, total: { type: 'integer', minimum: 0 } },
      },
      Error: {
        type: 'object', additionalProperties: false, required: ['error', 'requestId'],
        properties: {
          error: {
            type: 'object', additionalProperties: false, required: ['code', 'message'],
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          requestId: { type: 'string', format: 'uuid' },
        },
      },
      Health: {
        type: 'object', additionalProperties: false, required: ['status', 'apiVersion', 'time'],
        properties: { status: { const: 'ok' }, apiVersion: { const: 'v1' }, time: { type: 'string', format: 'date-time' } },
      },
      Service: {
        type: 'object', additionalProperties: false, required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
      ServiceCategory: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'services'],
        properties: { id: { type: 'string' }, name: { type: 'string' }, services: { type: 'array', items: { $ref: '#/components/schemas/Service' } } },
      },
      ServicePage: {
        type: 'object', additionalProperties: false, required: ['data', 'meta'],
        properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ServiceCategory' } }, meta: { $ref: '#/components/schemas/Pagination' } },
      },
      Device: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'icon', 'online', 'updatedAt'],
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, icon: { type: 'string' },
          online: { type: ['boolean', 'null'] }, updatedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      DevicePage: {
        type: 'object', additionalProperties: false, required: ['data', 'meta'],
        properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Device' } }, meta: { $ref: '#/components/schemas/Pagination' } },
      },
      Metric: {
        type: 'object', additionalProperties: false, required: ['key', 'kind', 'percent'],
        properties: {
          key: { type: 'string' }, kind: { type: 'string' }, name: { type: 'string' }, percent: { type: 'number' },
          totalBytes: { type: 'number', minimum: 0 }, usedBytes: { type: 'number', minimum: 0 }, temperatureC: { type: 'number' },
        },
      },
      LoadAverage: {
        type: 'object', additionalProperties: false, required: ['oneMinute'],
        properties: {
          oneMinute: { type: 'number' }, fiveMinutes: { type: 'number' }, fifteenMinutes: { type: 'number' },
        },
      },
      NetworkVitals: {
        type: 'object', additionalProperties: false,
        properties: {
          receiveBytesPerSecond: { type: 'number', minimum: 0 },
          transmitBytesPerSecond: { type: 'number', minimum: 0 },
          totalBytesPerSecond: { type: 'number', minimum: 0 },
        },
      },
      DeviceVitals: {
        type: 'object', additionalProperties: false,
        properties: {
          uptimeSeconds: { type: 'number', minimum: 0 }, logicalCores: { type: 'number', minimum: 1 },
          loadAverage: { $ref: '#/components/schemas/LoadAverage' },
          network: { $ref: '#/components/schemas/NetworkVitals' },
        },
      },
      DeviceMetrics: {
        type: 'object', additionalProperties: false, required: ['deviceId', 'status', 'updatedAt', 'metrics', 'vitals'],
        properties: {
          deviceId: { type: 'string' }, status: { type: 'string', enum: ['pending', 'offline', 'online'] },
          updatedAt: { type: ['string', 'null'], format: 'date-time' }, metrics: { type: 'array', items: { $ref: '#/components/schemas/Metric' } },
          vitals: { $ref: '#/components/schemas/DeviceVitals' },
        },
      },
      ApiKeyIdentity: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'prefix', 'scopes', 'createdAt', 'expiresAt'],
        properties: {
          id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, prefix: { type: 'string' },
          scopes: { type: 'array', items: { $ref: '#/components/schemas/Scope' } },
          createdAt: { type: 'string', format: 'date-time' }, expiresAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
    responses: {
      BadRequest: json({ $ref: '#/components/schemas/Error' }, 'Invalid query parameters or a credential supplied outside the Authorization header'),
      Unauthorized: json({ $ref: '#/components/schemas/Error' }, 'Missing, expired, revoked, or invalid API key'),
      Forbidden: json({ $ref: '#/components/schemas/Error' }, 'Origin is denied or the API key lacks the required scope'),
      HttpsRequired: json({ $ref: '#/components/schemas/Error' }, 'HTTPS is required'),
      NotFound: json({ $ref: '#/components/schemas/Error' }, 'The requested resource does not exist'),
      InternalError: json({ $ref: '#/components/schemas/Error' }, 'Stable error response without internal implementation details'),
      RateLimited: {
        ...json({ $ref: '#/components/schemas/Error' }, 'Per-key or per-client-IP rate limit exceeded'),
        headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: 'Seconds until this rate-limit window resets.' } },
      },
    },
  },
  'x-api-lifecycle': {
    stability: 'stable',
    versioning: 'The major API version is part of the URL.',
    deprecation: 'Deprecated fields and operations remain available for at least one minor release and are announced in release notes.',
  },
} as const;
