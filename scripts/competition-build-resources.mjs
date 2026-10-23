// Maintainer-only wrapper. A successful build retains intermediates until a separate delivery gate.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, lstat, readdir, realpath, rm, statfs, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 1;
const allowed = new Set(['source', 'payload', 'toolchain', 'internal-release', 'verified-internal-release', 'UED-Asset-Hub', 'UED-Asset-Hub-macOS-arm64', 'temp', 'npm-cache', 'corepack-cache', 'pnpm-store', 'node-gyp-cache']);
const hash = async file => { const h = createHash('sha256'); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); };
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const inside = (parent, child) => { const r = path.relative(parent, child); return r && !r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r); };
async function regularPath(target) {
  let current = path.resolve(target);
  while (true) { try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked ancestor rejected.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
async function used(root) { const s = await statfs(root); return Number(s.blocks - s.bfree) * Number(s.bsize); }
async function free(root) { const s = await statfs(root); return Number(s.bavail) * Number(s.bsize); }
function processes() {
  if (process.platform === 'win32') {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,@{n="Started";e={$_.CreationDate.ToUniversalTime().ToString("o")}} | ConvertTo-Json -Compress'], { encoding: 'utf8' });
    return [].concat(JSON.parse(raw || '[]')).map(p => ({ pid: p.ProcessId, parent: p.ParentProcessId, command: p.CommandLine || '', started: p.Started }));
  }
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).trim().split('\n').map(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (!m) throw new Error('Process audit failed.'); return { pid: +m[1], parent: +m[2], command: m[3] }; });
}
export function processIdentity(p) {
  return createHash('sha256').update(JSON.stringify([p.pid, p.started || null, p.command])).digest('hex');
}
function activeIn(root, rows, exclusions = []) {
  return rows.filter(p => !exclusions.includes(p.pid) && p.command.toLowerCase().includes(root.toLowerCase()));
}
async function inspectTree(root, countOnly = false) {
  let bytes = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name), info = await lstat(item);
    if (/^(?:dsh-home|DSH_HOME|\.credentials\.yaml|host-login\.env|runtime\.json|installation\.json)$/i.test(entry.name)) throw new Error('Protected runtime/configuration path found: ' + entry.name);
    // Links are unlinked, never traversed. Reject a link used as the cleanup root separately.
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) bytes += await inspectTree(item, countOnly);
    else if (info.isFile()) bytes += info.size;
    else throw new Error('Unexpected filesystem object.');
  }
  return bytes;
}

export async function runBuild({ scope, work, disposable, command, args = [] }) {
  scope = path.resolve(scope); work = path.resolve(work);
  await regularPath(scope); await regularPath(work);
  if (process.platform === 'win32' && path.parse(work).root.replace(/[\\/]+$/, '').toLowerCase() === (process.env.SystemDrive || 'C:').toLowerCase()) throw new Error('Competition builds must remain outside the system drive.');
  if (!inside(scope, work) || path.dirname(work) !== scope) throw new Error('Build must use a new immediate child of its isolated scope.');
  try { await lstat(work); throw new Error('Build work directory already exists.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (disposable.some(n => !allowed.has(n))) throw new Error('Unknown disposable build subdirectory.');
  const control = path.join(scope, '.competition-build-resources'); await mkdir(control, { recursive: true }); await regularPath(control);
  const lock = path.join(control, 'build.lock'); const handle = await open(lock, 'wx', 0o600);
  const ancestors = [process.pid]; const initialRows = processes();
  for (let pid = process.ppid; pid && !ancestors.includes(pid); pid = initialRows.find(p => p.pid === pid)?.parent) ancestors.push(pid);
  const tracked = new Map();
  let childIdentity;
  const ownedActive = () => {
    const rows = processes(), ids = new Set();
    const root = rows.find(p => p.pid === child?.pid);
    if (!childIdentity && root && !initialRows.some(p => processIdentity(p) === processIdentity(root))) childIdentity = processIdentity(root);
    for (const p of rows) if (processIdentity(p) === childIdentity || tracked.get(p.pid) === processIdentity(p)) ids.add(p.pid);
    let changed = true;
    while (changed) { changed = false; for (const p of rows) if (ids.has(p.parent) && !ids.has(p.pid) && !initialRows.some(before => processIdentity(before) === processIdentity(p))) { ids.add(p.pid); changed = true; } }
    for (const p of rows) if (ids.has(p.pid)) tracked.set(p.pid, processIdentity(p));
    return rows.filter(p => !ancestors.includes(p.pid) && (p.command.toLowerCase().includes(work.toLowerCase()) || tracked.get(p.pid) === processIdentity(p)));
  };
  const id = randomUUID(), recordFile = path.join(control, id + '.json');
  let released = false;
  const record = { schemaVersion: VERSION, id, scope: await realpath(scope), work, disposable, ownerPid: process.pid, state: 'BUILDING', startedAt: new Date().toISOString(), cachePolicy: 'One owned cache for pinned Node 22.23.2; shared user caches untouched', children: [], disk: { freeBefore: await free(scope), minimumFreeObserved: await free(scope), usedBefore: await used(scope), maximumUsedObserved: await used(scope), sampleIntervalMs: 2000 } };
  await handle.writeFile(JSON.stringify({ id, recordFile, ownerPid: process.pid }));
  let timer, child, monitoring, buildLog;
  const sample = async () => { ownedActive(); record.trackedChildren = [...tracked].map(([pid, processIdentitySha256]) => ({pid, processIdentitySha256})); record.disk.minimumFreeObserved = Math.min(record.disk.minimumFreeObserved, await free(scope)); record.disk.maximumUsedObserved = Math.max(record.disk.maximumUsedObserved, await used(scope)); await save(recordFile, record); };
  try {
    // The only retained cache is owned by this scope and all users hold this same exclusive lock.
    const cache = path.join(control, 'cache-node-22.23.2');
    await mkdir(cache, { recursive: true }); await regularPath(cache);
    const marker = path.join(cache, 'owner.json');
    try { const owner = JSON.parse(await readFile(marker, 'utf8')); if (owner.scope !== record.scope || owner.schemaVersion !== VERSION) throw new Error('Unknown build cache owner.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; if ((await readdir(cache)).length) throw new Error('Unowned cache is not reusable.'); await save(marker, { schemaVersion: VERSION, scope: record.scope, node: '22.23.2', integrity: 'npm/pnpm content-addressed integrity verification' }); }
    // Do not inherit a wrapper flag as authorization; builders validate the live ownership record.
    await save(recordFile, record);
    record.logFile = path.join(control, id + '.log');
    buildLog = createWriteStream(record.logFile, { flags: 'wx', mode: 0o600 });
    child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, UED_BUILD_RESOURCE_RECORD: recordFile, UED_BUILD_CACHE_ROOT: cache } });
    child.stdout.pipe(process.stdout, { end: false }); child.stderr.pipe(process.stderr, { end: false });
    child.stdout.pipe(buildLog, { end: false }); child.stderr.pipe(buildLog, { end: false });
    const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve(code ?? `signal:${signal}`)); });
    completion.catch(() => {}); // Keep spawn errors handled while the first disk/process sample is pending.
    record.children.push(child.pid); await sample();
    timer = setInterval(() => { if (!monitoring) monitoring = sample().finally(() => { monitoring = null; }); }, 2000);
    const code = await completion;
    await new Promise(resolve => buildLog.end(resolve));
    clearInterval(timer); if (monitoring) await monitoring; await sample();
    const remaining = ownedActive().filter(p => p.pid !== child.pid);
    record.state = code === 0 && !remaining.length ? 'BUILT' : 'FAILED';
    record.exitCode = code; record.remainingPids = remaining.map(p => p.pid);
    record.finishedAt = new Date().toISOString(); record.disk.freeAfterBuild = await free(scope); record.disk.usedAfterBuild = await used(scope);
    await save(recordFile, record);
    if (remaining.length) throw new Error('Build processes remain; intermediates and lock retained.');
    await handle.close(); await rm(lock); released = true;
    if (code !== 0) throw new Error('Build failed; diagnostics retained.');
    console.log(JSON.stringify({ resourceRecord: recordFile, state: record.state }));
    return recordFile;
  } catch (e) {
    clearInterval(timer); if (monitoring) await monitoring;
    if (buildLog && !buildLog.writableEnded) await new Promise(resolve => buildLog.end(resolve));
    record.state = 'FAILED'; record.error = e.message; await save(recordFile, record);
    // Release only after an auditable process check. Never kill or clean a failed build.
    if (!released && !ownedActive().length) { await handle.close(); await rm(lock); released = true; }
    throw e;
  }
}

export async function validateBuildOwner(work) {
  const file = process.env.UED_BUILD_RESOURCE_RECORD;
  if (!file) return false;
  await regularPath(file);
  const r = JSON.parse(await readFile(file, 'utf8'));
  const lock = JSON.parse(await readFile(path.join(path.dirname(file), 'build.lock'), 'utf8'));
  if (r.schemaVersion !== VERSION || r.state !== 'BUILDING' || path.resolve(work) !== r.work || lock.id !== r.id || !processes().some(p => p.pid === r.ownerPid)) throw new Error('Build ownership is invalid.');
  return true;
}

export async function cleanupBuild(recordFile, gateFile) {
  await regularPath(recordFile); await regularPath(gateFile);
  const r = JSON.parse(await readFile(recordFile, 'utf8')), gate = JSON.parse(await readFile(gateFile, 'utf8'));
  if (r.schemaVersion !== VERSION || r.state !== 'BUILT' || path.dirname(r.work) !== r.scope || !inside(r.scope, r.work) || path.dirname(recordFile) !== path.join(r.scope, '.competition-build-resources')) throw new Error('Owned completed build record required.');
  await regularPath(r.work);
  if (await realpath(r.scope) !== r.scope) throw new Error('Scope changed.');
  if (activeIn(r.work, processes(), [process.pid]).length) throw new Error('Build directory is still in use.');
  if (gate.schemaVersion !== 1 || !Array.isArray(gate.files) || !Array.isArray(gate.protectedPaths)) throw new Error('Delivery gate is incomplete.');
  const roles = new Set(gate.files.map(f => f.role));
  for (const role of ['zip', 'sha256', 'manifest', 'acceptance', 'dependencies']) if (!roles.has(role)) throw new Error('Missing delivery evidence: ' + role);
  for (const f of gate.files) { await regularPath(f.path); if (!/^[a-f0-9]{64}$/.test(f.sha256) || await hash(f.path) !== f.sha256) throw new Error('Saved delivery evidence hash mismatch.'); }
  const zip = gate.files.find(f => f.role === 'zip'), sha = gate.files.find(f => f.role === 'sha256');
  if (!(await readFile(sha.path, 'utf8')).trim().startsWith(zip.sha256 + ' ')) throw new Error('ZIP SHA-256 receipt mismatch.');
  const protectedPaths = [...gate.protectedPaths, ...gate.files.map(f => f.path), recordFile, gateFile].map(p => path.resolve(p));
  const log = { id: r.id, gateSha256: await hash(gateFile), startedAt: new Date().toISOString(), removed: [], skipped: [], freeBeforeCleanup: await free(r.scope), usedBeforeCleanup: await used(r.scope) };
  const logFile = recordFile + '.cleanup.json'; await save(logFile, log);
  for (const name of r.disposable) {
    if (!allowed.has(name)) throw new Error('Ownership record includes an unknown cleanup target.');
    const target = path.join(r.work, name); await regularPath(target);
    if (protectedPaths.some(p => p === target || inside(target, p) || inside(p, target))) { log.skipped.push({ target, reason: 'Referenced or protected' }); continue; }
    try {
      const info = await lstat(target); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Cleanup root must be a regular directory.');
      const bytes = await inspectTree(target);
      // Repeat process audit immediately before each deletion; no deletion on audit failure.
      if (activeIn(r.work, processes(), [process.pid]).length) throw new Error('Build became active.');
      await rm(target, { recursive: true }); log.removed.push({ target, logicalBytes: bytes });
    } catch (e) { if (e.code !== 'ENOENT') log.skipped.push({ target, reason: e.message }); }
    await save(logFile, log);
  }
  log.freeAfterCleanup = await free(r.scope); log.usedAfterCleanup = await used(r.scope); log.actualVolumeFreeDelta = log.freeAfterCleanup - log.freeBeforeCleanup;
  log.logicalBytesRemoved = log.removed.reduce((sum, item) => sum + item.logicalBytes, 0);
  log.sampledPeakVolumeConsumption = Number.isFinite(r.disk.freeBefore) && Number.isFinite(r.disk.minimumFreeObserved) ? r.disk.freeBefore - r.disk.minimumFreeObserved : 'NOT_RECORDED';
  log.buildDisk = r.disk;
  log.zipBytes = (await lstat(zip.path)).size; log.finishedAt = new Date().toISOString();
  r.state = 'CLEANED'; r.cleanupReport = logFile; await save(logFile, log); await save(recordFile, r);
  return log;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'run') { const [scope, work, names, command, ...argv] = args; await runBuild({ scope, work, disposable: names.split(',').filter(Boolean), command, args: argv }); }
  else if (mode === 'cleanup') console.log(JSON.stringify(await cleanupBuild(args[0], args[1])));
  else if (mode === 'validate') { if (!await validateBuildOwner(args[0])) process.exitCode = 1; }
  else throw new Error('Use run <scope> <new-work> <disposable-names> <command> [args], validate <work>, or cleanup <record> <delivery-gate>.');
}
