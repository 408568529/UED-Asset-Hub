import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { patchGenuiHaldurReading } from '../agent-integration/scripts/genui-haldur-reading.mjs';

const lock = JSON.parse(await fs.readFile('agent-integration/dsh/genui-plugin.json', 'utf8'));
const original = execFileSync('tar', ['-xOf', lock.packageTarball, 'package/lib/index.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const patched = patchGenuiHaldurReading(original);
assert.equal(patchGenuiHaldurReading(patched), patched);
const legacy = patched.replace(String.raw`\s(?:action|formAction|target)\s*=`, String.raw`\b(?:action|formAction|target)\s*=`);
assert.equal(patchGenuiHaldurReading(legacy), patched, 'Existing installations upgrade without losing prior patches');
assert.throws(() => patchGenuiHaldurReading(original + 'tampered'), /pinned/);
assert.throws(() => patchGenuiHaldurReading(patched + 'tampered'), /identity/);
const rules = source => {
  const start = source.indexOf('const SANDBOX_SOURCE_RULES = [');
  const end = source.indexOf('\nfunction sandboxContractDiagnostics', start);
  assert.ok(start > 0 && end > start);
  return vm.runInNewContext(source.slice(start, end) + ';SANDBOX_SOURCE_RULES');
};
const allowed = [
  '<button data-genui-primary-action="true">查询</button>',
  '<button data-genui-primary-action>查询</button>',
  '<button data-genui-primary-action={true}>查询</button>',
  '<button data-action="query" aria-expanded={open}>查询</button>',
  '<input data-target="field" />',
  '<button\n data-genui-primary-action="true"\n aria-label="查询">查询</button>',
];
const blocked = [
  '<form action="/write" />', '<button formAction="/write" />', '<input formAction={destination} />',
  '<form target="_blank" />', '<button target="_blank" />', '<input target={target} />',
  '<form\n action = {destination} />', '<button FORMACTION = "/write" />',
  '<button data-genui-primary-action="true" formAction="/write" />',
  '<button data-target="safe" target="_blank" />',
  '<a href="/outside">离开</a>', '<meta httpEquiv="refresh" content="0;url=/outside" />',
  'React.createElement("a", {href:"/outside"})', 'createElement("meta", {})',
  'form.submit()', 'form.requestSubmit()', 'window.open("/outside")', 'window.location.href="/outside"',
  'fetch("/outside")', 'new WebSocket("wss://outside")', 'element.innerHTML="<a>"',
];
const oldRules = rules(original);
assert.ok(oldRules.some(rule => rule.pattern.test(allowed[0])), 'Original regression must reproduce');
const source = process.argv[2] ? await fs.readFile(process.argv[2], 'utf8') : patched;
const current = rules(source);
for (const value of allowed) assert.ok(!current.some(rule => rule.pattern.test(value)), 'Unexpected rejection: ' + value);
for (const value of blocked) assert.ok(current.some(rule => rule.pattern.test(value)), 'Restriction bypass: ' + value);

let compiled = 0, rejected = 0;
if (process.argv[2]) {
  const { buildArtifact } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ued-genui-contract-'));
  const version = jsx => ({ id: 'v-regression', artifactId: 'regression', files: [{ path: 'src/main.tsx', content: `import {createRoot} from 'react-dom/client';createRoot(document.getElementById('root')).render(${jsx});` }] });
  try {
    for (const jsx of [allowed[0], allowed[1], allowed[2]]) {
      const result = await buildArtifact(version(jsx), path.join(root, 'good-' + compiled));
      assert.equal(result.ok, true, JSON.stringify(result)); compiled++;
    }
    for (const jsx of blocked.slice(0, 12)) {
      const result = await buildArtifact(version(jsx), path.join(root, 'bad-' + rejected));
      assert.equal(result.ok, false, 'Unsafe build accepted: ' + jsx); assert.equal(result.outputFiles.length, 0); rejected++;
    }
    if (process.argv[3]) {
      const fixture = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
      const result = await buildArtifact(fixture, path.join(root, 'original-aurora'));
      assert.equal(result.ok, true, JSON.stringify(result)); compiled++;
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ result: 'PASS_GENUI_NAVIGATION_ATTRIBUTES', allowed: allowed.length, blocked: blocked.length, compiled, rejected, patchIdempotent: true, legacyUpgrade: true, unknownBytesRejected: true }));
