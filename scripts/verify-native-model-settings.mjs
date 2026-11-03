import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { allowsPublicAgentRequest } from '../agent-integration/scripts/agent-public-access.mjs';
import { nativeModelConfiguration } from '../agent-integration/scripts/native-model-configuration.mjs';
import { nativeSettingsClient } from '../agent-integration/scripts/native-settings-client.mjs';
const settings = { namespaces: [{ ns: 'agent-default-model', value: { provider: 'custom', model: 'local-model' } }, { ns: 'llm-openai-compatible', value: { providers: { custom: { apiKeyEnv: 'CUSTOM_API_KEY' } } } }] };
const catalog = { groups: [{ id: 'custom', models: [{ id: 'local-model' }] }] };
const directory = { providers: [{ provider: 'custom', active: true, settingsNs: 'llm-openai-compatible', settingsPath: ['providers', 'custom'] }] };
assert.deepEqual(nativeModelConfiguration(settings, catalog, directory), { valid: true, credentialRef: 'CUSTOM_API_KEY' });
assert.equal(nativeModelConfiguration(settings, { groups: [] }, directory).valid, false);
assert.equal(nativeModelConfiguration(settings, catalog, { providers: [{ ...directory.providers[0], active: false }] }).valid, false);
assert.deepEqual(nativeModelConfiguration({ namespaces: [] }, { groups: [{ id: 'deepseek-official', models: [{ id: 'deepseek-v4-flash' }] }] }, { providers: [{ provider: 'deepseek-official', active: true, settingsNs: 'llm-deepseek', settingsPath: [] }] }), { valid: true, credentialRef: 'DEEPSEEK_API_KEY' });
assert.equal(nativeSettingsClient('unrecognized dependency', false), 'unrecognized dependency');
assert.throws(() => nativeSettingsClient('unrecognized dependency', true), /version/);
if (process.argv[2]) {
  const source = await fs.readFile(process.argv[2], 'utf8');
  const patched = nativeSettingsClient(source, true);
  assert.equal(nativeSettingsClient(source, false), source);
  assert.equal(patched.includes('connection.isLoopback ? "host" : "memory"'), false);
  assert.equal(patched.split('"host"').length - source.split('"host"').length, 0);
}
console.log('PASS: native provider selection, credential references, missing models, inactive providers, default compatibility and pinned admin-only settings scope');

const request = { method: 'POST', headers: { origin: 'http://192.0.2.10:3027', 'sec-fetch-site': 'same-origin' } };
const environment = { AGENT_PUBLIC_ACCESS: 'true', PUBLIC_ORIGIN: request.headers.origin };
assert.equal(allowsPublicAgentRequest(request, new URL(request.headers.origin + '/api/session.selectModel'), environment), true);
for (const method of ['settings.mutate', 'settings.update', 'credentials.set', 'llm.discoverModels']) assert.equal(allowsPublicAgentRequest(request, new URL(request.headers.origin + '/api/' + method), environment), false);
