import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Script } from 'node:vm';
import { regions, excerpt } from './regions.mjs';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const locks = new Map();
const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const VERSION = /^v-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const textExtensions = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.txt']);
const maxFile = 4 * 1024 * 1024, maxTotal = 16 * 1024 * 1024;
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\') || value.includes('%') || path.posix.isAbsolute(value) || value !== value.normalize('NFC')) throw Error('成果路径无效。');
  if (value.split('/').some(p => !p || p.startsWith('.') || /[<>:"|?*\u0000-\u001f]/u.test(p) || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('成果路径无效。');
  return value;
}
function title(value) { if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f]/u.test(value)) throw Error('成果标题无效。'); return value.trim(); }
export function scopedId(owner, requested) {
  if (typeof owner !== 'string' || !owner || owner.length > 512 || typeof requested !== 'string') throw Error('需要当前会话和成果ID。');
  const prefix = 's-' + digest(owner).slice(0, 16) + '-';
  if (!requested.startsWith(prefix) && !/^[a-z0-9][a-z0-9-]{2,47}$/.test(requested)) throw Error('成果ID请使用3到48字符的小写英文、数字和连字符。');
  const id = requested.startsWith(prefix) ? requested : prefix + requested;
  if (!ID.test(id)) throw Error('成果ID请使用3到48字符的小写英文、数字和连字符。');
  return id;
}
async function safeDirectory(dir, create = false) {
  const parsed = path.parse(path.resolve(dir)); let at = parsed.root;
  for (const part of path.resolve(dir).slice(at.length).split(path.sep).filter(Boolean)) {
    at = path.join(at, part);
    if (create) await fs.mkdir(at).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(at);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('成果目录不可用。');
  }
}
async function locked(key, action) {
  const previous = locks.get(key) ?? Promise.resolve(); let release;
  const gate = new Promise(resolve => { release = resolve; }); const tail = previous.catch(() => {}).then(() => gate); locks.set(key, tail);
  await previous.catch(() => {});
  try { return await action(); } finally { release(); if (locks.get(key) === tail) locks.delete(key); }
}
async function jsonFile(file) { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw Error('成果记录不可用。'); return JSON.parse(await fs.readFile(file, 'utf8')); }
async function atomic(file, value) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); await fs.rename(temp, file);
}
function validateHtml(text) {
  if (!/<html\b/i.test(text) || !/<body\b/i.test(text) || !/<\/html\s*>/i.test(text)) throw Error('HTML 结构不完整，已保留上个版本。');
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(match[1])) continue;
    if (/\btype\s*=\s*["']module["']/i.test(match[1])) continue; // Module syntax is checked by the sandboxed browser, never executed here.
    // Parse only. Never execute template code in the Harness/server process.
    new Script(match[2], { filename: 'html-artifact-inline.js' });
  }
}
export class HtmlArtifacts {
  constructor(root) { this.root = path.resolve(root); }
  async init() {
    await safeDirectory(this.root, true);
    const file = path.join(this.root, '.preview-key');
    try { await fs.writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) throw Error('预览签名配置不可用。');
    this.secret = await fs.readFile(file);
  }
  directory(id) { if (!ID.test(id)) throw Error('成果ID无效。'); return path.join(this.root, id); }
  async record(id, owner) {
    const dir = this.directory(id); await safeDirectory(dir);
    const record = await jsonFile(path.join(dir, 'artifact.json'));
    if (record.id !== id || (owner !== undefined && record.owner !== owner)) throw Error('成果不属于当前会话。');
    return record;
  }
  async version(id, version, owner) {
    const record = await this.record(id, owner); version ??= record.current;
    if (!VERSION.test(version)) throw Error('版本ID无效。');
    const dir = path.join(this.directory(id), version); await safeDirectory(dir);
    const manifest = await jsonFile(path.join(dir, 'version.json'));
    if (manifest.id !== id || manifest.version !== version || !Array.isArray(manifest.files) || manifest.files.length > 50) throw Error('成果版本清单不可用。');
    return { record, manifest, dir };
  }
  async bytes(version, relative) {
    relativePath(relative);
    const spec = version.manifest.files.find(file => file.path === relative);
    if (!spec || !Number.isSafeInteger(spec.bytes) || spec.bytes > maxFile) throw Error('成果中不存在该文件。');
    const directory = path.join(version.dir, 'files'); await safeDirectory(path.join(directory, ...relative.split('/').slice(0, -1)));
    const file = path.join(directory, ...relative.split('/')); const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== spec.bytes) throw Error('成果文件已改变。');
    const handle = await fs.open(file, 'r');
    try {
      const opened = await handle.stat(); if (opened.ino !== stat.ino || opened.dev !== stat.dev || !opened.isFile()) throw Error('成果文件已改变。');
      const bytes = Buffer.alloc(spec.bytes + 1); let size = 0;
      while (size < bytes.length) { const part = await handle.read(bytes, size, bytes.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
      const end = await handle.stat(), current = await fs.lstat(file);
      const body = bytes.subarray(0, size);
      if (size !== spec.bytes || end.size !== opened.size || end.mtimeMs !== opened.mtimeMs || end.ctimeMs !== opened.ctimeMs || current.isSymbolicLink() || current.ino !== opened.ino || current.dev !== opened.dev || digest(body) !== spec.sha256) throw Error('成果文件校验失败。');
      return body;
    } finally { await handle.close(); }
  }
  async publish(record, files, entry, provenance, baseVersion) {
    const id = record.id, version = 'v-' + randomUUID();
    const dir = path.join(this.directory(id), 'draft-' + randomUUID()); await fs.mkdir(dir);
    try {
      let total = 0; const manifestFiles = [];
      for (const [relative, body] of files) {
        relativePath(relative); total += body.length;
        if (body.length > maxFile || total > maxTotal || manifestFiles.length >= 48) throw Error('成果超过文件或总量预算。');
        const at = path.join(dir, 'files', ...relative.split('/')); await fs.mkdir(path.dirname(at), { recursive: true }); await fs.writeFile(at, body, { flag: 'wx', mode: 0o600 });
        manifestFiles.push({ path: relative, bytes: body.length, sha256: digest(body) });
        if (/\.html?$/i.test(relative)) validateHtml(new TextDecoder('utf-8', { fatal: true }).decode(body));
      }
      if (!files.has(entry)) throw Error('成果缺少入口。');
      const manifest = { id, version, title: record.title, entry, files: manifestFiles, provenance, parent: baseVersion ?? null, createdAt: new Date().toISOString() };
      await fs.writeFile(path.join(dir, 'version.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
      await fs.rename(dir, path.join(this.directory(id), version));
      await atomic(path.join(this.directory(id), 'artifact.json'), { ...record, current: version });
      return this.receipt(manifest);
    } catch (error) { await fs.rm(dir, { recursive: true, force: true }); throw error; }
  }
  receipt(manifest) { return { artifact_id: manifest.id, version_id: manifest.version, title: manifest.title, entry: manifest.entry, files: manifest.files, parent_version: manifest.parent, status: 'ready', template_id: manifest.provenance?.templateId ?? 'list-page', template_path: manifest.provenance?.templatePath ?? manifest.entry }; }
  async create(owner, requested, displayTitle, bundle) {
    const id = scopedId(owner, requested);
    return locked(this.directory(id), async () => {
      await safeDirectory(this.root);
      const dir = this.directory(id); await fs.mkdir(dir).catch(error => { if (error.code === 'EEXIST') throw Error('同名成果已存在，请读取并修改已有成果。'); throw error; });
      try {
        if (!['list-page','skill-html'].includes(bundle.templateId) || !Array.isArray(bundle.files) || bundle.files.length > 47) throw Error('模板包无效。');
        const files = new Map(); const caseNames = new Set();
        for (const spec of bundle.files) {
          relativePath(spec.path); const key = spec.path.toLocaleLowerCase('en-US');
          if (caseNames.has(key) || typeof spec.content !== 'string' || !Number.isSafeInteger(spec.bytes) || spec.bytes < 0 || spec.bytes > maxFile || spec.content.length > 6 * 1024 * 1024) throw Error('模板清单冲突或过大。');
          const bytes = Buffer.from(spec.content, 'base64'); if (bytes.length !== spec.bytes || digest(bytes) !== spec.sha256) throw Error('模板文件校验失败。');
          caseNames.add(key); files.set(spec.path, bytes);
        }
        relativePath(bundle.entry);
        const record = { id, owner, title: title(displayTitle) };
        const location = './' + bundle.entry.split('/').map(encodeURIComponent).join('/');
        if (!files.has('index.html')) files.set('index.html', Buffer.from(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escapeHtml(location)}"><title>${escapeHtml(record.title)}</title></head><body><a href="${escapeHtml(location)}">打开成果</a></body></html>`));
        const provenance = { templateId: bundle.templateId, templatePath: bundle.templatePath ?? bundle.entry, sourceRevision: bundle.sourceRevision, sourceEntrySha256: bundle.sourceEntrySha256, sources: bundle.files.map(({ path, sha256, source }) => ({ path, sha256, source })), warnings: bundle.warnings ?? [] };
        return await this.publish(record, files, bundle.entry, provenance);
      } catch (error) { await fs.rm(dir, { recursive: true, force: true }); throw error; }
    });
  }
  async inspect(owner, requested, input = {}) {
    const value = await this.version(scopedId(owner, requested), input.version_id, owner); const relative = input.path ?? value.manifest.entry;
    const bytes = await this.bytes(value, relative);
    if (!textExtensions.has(path.posix.extname(relative).toLowerCase())) throw Error('局部查看仅适用于文本文件。');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const summary = { ...this.receipt(value.manifest), path: relative, sha256: digest(bytes), regions: regions(text) };
    if (input.anchor === undefined && input.region === undefined && input.offset === undefined) return summary;
    return { ...summary, ...excerpt(text, input) };
  }
  async patch(owner, requested, baseVersion, changes) {
    const id = scopedId(owner, requested);
    return locked(this.directory(id), async () => {
      const value = await this.version(id, baseVersion, owner);
      if (value.record.current !== baseVersion) throw Error('成果已有新版本，请先读取当前成果。');
      if (!Array.isArray(changes) || !changes.length || changes.length > 8 || Buffer.byteLength(JSON.stringify(changes)) > 256 * 1024) throw Error('每批请提交1到8项局部修改。');
      const files = new Map(); for (const file of value.manifest.files) files.set(file.path, await this.bytes(value, file.path));
      for (const change of changes) {
        const relative = relativePath(change.path), spec = value.manifest.files.find(file => file.path === relative);
        if (!spec || spec.sha256 !== change.sha256 || !textExtensions.has(path.posix.extname(relative).toLowerCase())) throw Error('修改文件或校验值不匹配，请重新局部读取。');
        if (typeof change.old_text !== 'string' || !change.old_text || change.old_text.length > 32000 || typeof change.new_text !== 'string' || change.new_text.length > 32000) throw Error('替换内容必须是有界的准确原文。');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(files.get(relative)); const at = text.indexOf(change.old_text);
        if (at < 0 || text.indexOf(change.old_text, at + 1) >= 0) throw Error('替换锚点不唯一或不存在，原版本保持不变。');
        files.set(relative, Buffer.from(text.slice(0, at) + change.new_text + text.slice(at + change.old_text.length)));
      }
      return this.publish(value.record, files, value.manifest.entry, value.manifest.provenance, baseVersion);
    });
  }
  grant(id, version, now = Date.now()) {
    if (!ID.test(id) || !VERSION.test(version)) throw Error('预览版本无效。');
    const payload = Buffer.from(JSON.stringify({ id, version, expiresAt: now + 30 * 60 * 1000 })).toString('base64url');
    return payload + '.' + createHmac('sha256', this.secret).update('html-preview-v1.' + payload).digest('base64url');
  }
  accepts(id, version, grant, now = Date.now()) {
    try {
      if (typeof grant !== 'string' || grant.length > 1024) return false;
      const [payload, signature, extra] = grant.split('.'); if (!payload || !signature || extra !== undefined) return false;
      const expected = createHmac('sha256', this.secret).update('html-preview-v1.' + payload).digest(); const actual = Buffer.from(signature, 'base64url');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
      const scope = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return scope.id === id && scope.version === version && Number.isSafeInteger(scope.expiresAt) && scope.expiresAt > now && scope.expiresAt <= now + 30 * 60 * 1000;
    } catch { return false; }
  }
}
