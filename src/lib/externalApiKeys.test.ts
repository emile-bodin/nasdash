import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nasdash-external-keys-'));
process.env.NASDASH_DATA_DIR = dataDirectory;
process.env.VITEST = 'true';

const keys = await import('./externalApiKeys');

describe('external API keys', () => {
  beforeEach(() => keys.resetExternalApiKeysForTests());
  afterAll(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

  it('stores only a hash and displays the token once', () => {
    const created = keys.createExternalApiKey({ name: 'automation', scopes: ['read:health', 'read:devices'] });
    expect(created.token).toMatch(/^ndk_/);
    expect(keys.authenticateExternalApiKey(created.token)?.id).toBe(created.key.id);
    expect(keys.listExternalApiKeys()[0]).not.toHaveProperty('hash');

    const persisted = fs.readFileSync(path.join(dataDirectory, 'external-api-keys.json'), 'utf8');
    expect(persisted).not.toContain(created.token);
    expect(persisted).toContain('automation');
  });

  it('rejects revoked and expired keys', () => {
    const active = keys.createExternalApiKey({ name: 'active', scopes: ['read:health'] });
    expect(keys.revokeExternalApiKey(active.key.id)).toBe(true);
    expect(keys.authenticateExternalApiKey(active.token)).toBeNull();

    const expired = keys.createExternalApiKey({ name: 'expired', scopes: ['read:health'], expiresAt: '2000-01-01T00:00:00.000Z' });
    expect(keys.authenticateExternalApiKey(expired.token)).toBeNull();
  });
});
