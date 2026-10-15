import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth', () => ({ checkAdmin: vi.fn(() => null) }));

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nasdash-api-key-route-'));
process.env.NASDASH_DATA_DIR = dataDirectory;
process.env.VITEST = 'true';
delete process.env.NASDASH_DEMO_MODE;

const auth = await import('@/lib/auth');
const keys = await import('@/lib/externalApiKeys');
const route = await import('./route');

describe('admin API key management', () => {
  beforeEach(() => {
    vi.mocked(auth.checkAdmin).mockReturnValue(null);
    keys.resetExternalApiKeysForTests();
  });
  afterAll(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

  it('creates a scoped key, reveals it once, lists metadata, and revokes it', async () => {
    const create = await route.POST(new Request('http://localhost/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'AI reader', scopes: ['read:health', 'read:services'] }),
    }) as never);
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.token).toMatch(/^ndk_/);

    const list = await route.GET(new Request('http://localhost/api/auth/api-keys') as never);
    const listed = await list.json();
    expect(listed[0]).toMatchObject({ id: created.key.id, name: 'AI reader', scopes: ['read:health', 'read:services'] });
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain('hash');

    const revoke = await route.DELETE(new Request(`http://localhost/api/auth/api-keys?id=${created.key.id}`, { method: 'DELETE' }) as never);
    expect(revoke.status).toBe(200);
    expect(keys.authenticateExternalApiKey(created.token)).toBeNull();
  });

  it('requires an administrator and rejects invalid scopes', async () => {
    vi.mocked(auth.checkAdmin).mockReturnValueOnce(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
    expect((await route.GET(new Request('http://localhost/api/auth/api-keys') as never)).status).toBe(401);

    const invalid = await route.POST(new Request('http://localhost/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'writer', scopes: ['write:config'] }),
    }) as never);
    expect(invalid.status).toBe(400);
    expect(keys.listExternalApiKeys()).toEqual([]);
  });
});
