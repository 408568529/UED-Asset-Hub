import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
const [serverModule, browserModule] = process.argv.slice(2);
assert.ok(serverModule && browserModule, 'GenUI server and HTML browser-check modules required');
const { buildArtifact } = await import(pathToFileURL(path.resolve(serverModule)).href);
const { checkHtml } = await import(pathToFileURL(path.resolve(browserModule)).href);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ued-genui-marker-'));
let server;
try {
  const result = await buildArtifact({ id: 'v-marker-test', artifactId: 'marker-test', files: [{ path: 'src/main.tsx', content: `import {useState} from 'react';import {createRoot} from 'react-dom/client';function App(){const [done,setDone]=useState(false);return <button data-genui-primary-action="true" onClick={()=>setDone(true)}>{done?'已查询':'查询'}</button>}createRoot(document.getElementById('root')).render(<App/>);` }] }, root);
  assert.equal(result.ok, true, JSON.stringify(result));
  server = http.createServer(async (req, res) => {
    if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(await fs.readFile(path.join(root, 'app.js'))); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  const report = await checkHtml({ entryUrl: origin, scopeUrl: origin, workRoot: root, input: { intent: 'interactive', missing_requirements: [], requirements: [
    { name: '正常主操作标记渲染', steps: [], expect: [{ kind: 'attribute', selector: 'button', attribute: 'data-genui-primary-action', equals: 'true' }] },
    { name: '主操作按钮可执行', steps: [{ action: 'click', selector: 'button' }], expect: [{ kind: 'text', selector: 'button', equals: '已查询' }] },
  ] } });
  assert.equal(report.status, 'passed', JSON.stringify(report));
  console.log(JSON.stringify({ result: 'PASS_GENUI_MARKER_REAL_BROWSER', build: 'passed', browser: report.browser, runtime: report.runtime.status, requirements: report.requirements.map(x => ({ name: x.name, status: x.status })) }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  await fs.rm(root, { recursive: true, force: true });
}
