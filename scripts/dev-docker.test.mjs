import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('isolated Docker development deployment', () => {
  it('fails clearly on an explicitly requested occupied port before deployment', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nasdash-dev-docker-'));
    temporaryDirectories.push(directory);
    const docker = path.join(directory, 'docker');
    const log = path.join(directory, 'docker.log');
    fs.writeFileSync(docker, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NASDASH_TEST_DOCKER_LOG"\nexit 0\n', { mode: 0o755 });

    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to allocate a test port.');
    try {
      const result = spawnSync(process.execPath, ['scripts/dev-docker.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH || ''}`,
          NASDASH_DEV_PORT: String(address.port),
          NASDASH_TEST_DOCKER_LOG: log,
        },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Requested development port ${address.port} is already in use.`);
      const dockerCalls = fs.readFileSync(log, 'utf8');
      expect(dockerCalls).toContain('version\ncompose version\n');
      expect(dockerCalls).toContain('port nasdash-dev 2504/tcp');
      expect(dockerCalls).not.toContain(' up ');
    } finally {
      server.close();
    }
  });

  it('keeps development state and networking separate from production', () => {
    const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.dev.yml'), 'utf8');
    expect(compose).toContain('127.0.0.1:${NASDASH_DEV_PORT:-2514}:2504');
    expect(compose).toContain('nasdash_dev_data:/app/data');
    expect(compose).not.toContain('./data:/app/data');
    expect(compose).not.toContain('/var/run/docker.sock');
  });
});
