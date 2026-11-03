import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { nativeSettingsClientPath } from '../agent-integration/scripts/native-settings-client.mjs';
const source = await fs.readFile(process.argv[2], 'utf8');
const server = http.createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/javascript' }); response.end(source); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const reserve = http.createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'ued-native-settings-test-'));
const secret = randomBytes(32).toString('hex');
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['agent-integration/scripts/start-agent-proxy.mjs'], { cwd: process.cwd(), env: { ...process.env, ADMIN_USERNAME: 'test-admin', ADMIN_SESSION_SECRET: secret, AGENT_RUNTIME_DIR: runtime, AGENT_PROXY_PORT: String(port), DSH_BASE_URL: `http://127.0.0.1:${server.address().port}`, AGENT_PUBLIC_ACCESS: 'true', PUBLIC_ORIGIN: origin }, stdio: 'ignore' });
try {
  let ready = false;
  for (let n = 0; n < 100; n++) { try { const r = await fetch(origin + nativeSettingsClientPath); if (r.ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(ready, 'Proxy did not start');
  const payload = Buffer.from(JSON.stringify({ username: 'test-admin', expiresAt: Date.now() + 60000 })).toString('base64url');
  const cookie = 'ued_admin_session=' + payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
  const admin = await fetch(origin + nativeSettingsClientPath, { headers: { Cookie: cookie } });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get('cache-control'), 'private, no-store');
  assert.equal((await admin.text()).includes('connection.isLoopback ? "host" : "memory"'), false);
  assert.equal(await (await fetch(origin + nativeSettingsClientPath)).text(), source);
  const refused = await fetch(origin + '/api/settings.mutate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
  assert.equal(refused.status, 401);
  const expired = Buffer.from(JSON.stringify({ username: 'test-admin', expiresAt: 1 })).toString('base64url');
  assert.equal(await (await fetch(origin + nativeSettingsClientPath, { headers: { Cookie: 'ued_admin_session=' + expired + '.' + createHmac('sha256', secret).update(expired).digest('base64url') } })).text(), source);
  console.log('PASS: authenticated native settings persistence, guest isolation, expired session, no-store and guest mutation refusal');
} finally {
  child.kill();
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(runtime, { recursive: true, force: true });
}
