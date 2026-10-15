import net from 'node:net';
import { spawnSync } from 'node:child_process';

const configuredPort = process.env.NASDASH_DEV_PORT?.trim();
const firstPort = configuredPort ? Number.parseInt(configuredPort, 10) : 2514;
if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65_535) {
  console.error(`[NASDASH] Invalid NASDASH_DEV_PORT: ${configuredPort}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

function available(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

run('docker', ['version']);
run('docker', ['compose', 'version']);

function usedByDevelopmentContainer(port) {
  const result = spawnSync('docker', ['port', 'nasdash-dev', '2504/tcp'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return false;
  return (result.stdout || '').split(/\r?\n/).some(binding => binding.trim() === `127.0.0.1:${port}`);
}

let port = firstPort;
if (!(await available(port)) && !usedByDevelopmentContainer(port)) {
  if (configuredPort) {
    console.error(`[NASDASH] Requested development port ${port} is already in use.`);
    process.exit(1);
  }
  let found = false;
  for (let candidate = firstPort + 1; candidate <= firstPort + 20; candidate += 1) {
    if (await available(candidate)) { port = candidate; found = true; break; }
  }
  if (!found) {
    console.error(`[NASDASH] No free development port found between ${firstPort} and ${firstPort + 20}.`);
    process.exit(1);
  }
  console.info(`[NASDASH] Port ${firstPort} is in use; selected ${port}.`);
}

const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.build.yml', '-f', 'docker-compose.dev.yml'];
run('docker', [...compose, 'up', '-d', '--build'], { env: { ...process.env, NASDASH_DEV_PORT: String(port) } });

const url = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 120_000;
let healthy = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) { healthy = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1_000));
}

if (!healthy) {
  console.error('[NASDASH] Development container did not become healthy within 120 seconds.');
  console.error(`[NASDASH] Inspect it with: docker ${compose.join(' ')} logs nasdash`);
  process.exit(1);
}

console.info(`[NASDASH] Isolated development deployment is ready at ${url}`);
console.info('[NASDASH] Data is stored only in the nasdash_dev_data volume. Credentials were not printed.');
