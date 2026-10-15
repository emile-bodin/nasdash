import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDataPath } from './dataDirectory';
import { safeWriteFileSync } from './config';

export const EXTERNAL_API_SCOPES = [
  'read:health',
  'read:services',
  'read:devices',
  'read:metrics',
] as const;

export type ExternalApiScope = typeof EXTERNAL_API_SCOPES[number];

export interface ExternalApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: ExternalApiScope[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

export type ExternalApiKeyView = Omit<ExternalApiKeyRecord, 'hash'>;

const KEYS_PATH = getDataPath('external-api-keys.json');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function validRecord(value: unknown): value is ExternalApiKeyRecord {
  if (!value || typeof value !== 'object') return false;
  const key = value as Partial<ExternalApiKeyRecord>;
  return typeof key.id === 'string'
    && typeof key.name === 'string'
    && typeof key.prefix === 'string'
    && typeof key.hash === 'string'
    && Array.isArray(key.scopes)
    && key.scopes.every(scope => EXTERNAL_API_SCOPES.includes(scope as ExternalApiScope))
    && typeof key.createdAt === 'string';
}

export function readExternalApiKeys(): ExternalApiKeyRecord[] {
  try {
    if (!fs.existsSync(KEYS_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) as unknown;
    return Array.isArray(parsed) ? clone(parsed.filter(validRecord)) : [];
  } catch (error) {
    console.error('[NASDASH] Cannot read external API key store.', error);
    return [];
  }
}

function writeExternalApiKeys(keys: ExternalApiKeyRecord[]): void {
  safeWriteFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function listExternalApiKeys(): ExternalApiKeyView[] {
  return readExternalApiKeys().map(({ hash: _hash, ...key }) => key);
}

export function createExternalApiKey(input: {
  name: string;
  scopes: ExternalApiScope[];
  expiresAt?: string;
}): { key: ExternalApiKeyView; token: string } {
  const token = `ndk_${crypto.randomBytes(32).toString('base64url')}`;
  const record: ExternalApiKeyRecord = {
    id: crypto.randomUUID(),
    name: input.name,
    prefix: token.slice(0, 12),
    hash: hashToken(token),
    scopes: [...new Set(input.scopes)],
    createdAt: new Date().toISOString(),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
  writeExternalApiKeys([...readExternalApiKeys(), record]);
  const { hash: _hash, ...key } = record;
  return { key, token };
}

export function revokeExternalApiKey(id: string): boolean {
  const keys = readExternalApiKeys();
  const key = keys.find(candidate => candidate.id === id);
  if (!key) return false;
  if (!key.revokedAt) key.revokedAt = new Date().toISOString();
  writeExternalApiKeys(keys);
  return true;
}

export function authenticateExternalApiKey(token: string): ExternalApiKeyRecord | null {
  if (!/^ndk_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const candidateHash = Buffer.from(hashToken(token), 'hex');
  const keys = readExternalApiKeys();
  const now = Date.now();
  const match = keys.find(key => {
    const storedHash = Buffer.from(key.hash, 'hex');
    return storedHash.length === candidateHash.length
      && crypto.timingSafeEqual(storedHash, candidateHash);
  });
  if (!match || match.revokedAt) return null;
  if (match.expiresAt && Date.parse(match.expiresAt) <= now) return null;

  const lastUsed = match.lastUsedAt ? Date.parse(match.lastUsedAt) : 0;
  if (!Number.isFinite(lastUsed) || now - lastUsed >= 60_000) {
    match.lastUsedAt = new Date(now).toISOString();
    writeExternalApiKeys(keys);
  }
  return clone(match);
}

export function resetExternalApiKeysForTests(): void {
  if (process.env.VITEST && fs.existsSync(KEYS_PATH)) fs.unlinkSync(KEYS_PATH);
}
