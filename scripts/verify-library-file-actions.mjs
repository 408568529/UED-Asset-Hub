import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const compile = async file => ts.transpileModule(await fs.readFile(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
async function load(file) {
  const source = await compile(file), exports = {};
  const dependencies = {};
  for (const match of source.matchAll(/require\("(\.\/[^"]+)"\)/g)) dependencies[match[1]] = await load(path.posix.join(path.posix.dirname(file), match[1]) + ".ts");
  vm.runInNewContext(source, { exports, require: name => dependencies[name] ?? require(name), Buffer, process, setTimeout, structuredClone });
  return exports;
}

// Synthetic storage only; check export paths, contents, metadata, collisions and integrity.
const { MicroStandardStore, initializeMicroRoot } = await load("src/services/microStandardStore.ts");
const { microStandardExportEntries } = await load("src/services/microStandardExportService.ts");
const temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "ued-library-actions-"));
try {
  const storage = path.join(temporary, "micro");
  await initializeMicroRoot(storage);
  const store = new MicroStandardStore(storage);
  await store.topic("create", "文案"); await store.topic("create", "表单");
  const stamp = new Date().toISOString();
  const doc = { metadata: { schemaVersion: 1, id: "micro-spec_test", documentType: "micro-spec", title: "金额", specTopic: "文案", relatedScopes: ["portal"], tags: [], description: "", category: "", author: "测试", createdAt: stamp, updatedAt: stamp, contentFormat: "markdown", status: "published", legacySource: null, legacyId: null }, content: "# 金额\n单位在后。" };
  await store.put(doc);
  await assert.rejects(store.put({ ...doc, metadata: { ...doc.metadata, id: "micro-spec_duplicate" } }), /同名/);
  const entries = await microStandardExportEntries(store, "文案");
  assert.equal(entries.length, 2); assert.equal(entries[0].content, doc.content);
  assert.ok(entries[0].name.startsWith("文案/")); assert.ok(!entries[0].name.includes(".."));
  assert.equal(JSON.parse(entries[1].content).documents[0].id, doc.metadata.id);
  const route = {};
  vm.runInNewContext(await compile("src/app/api/micro-standards/download/route.ts"), { exports: route, Response, URL, require: name => name === "@/services/microStandardService" ? { microStore: () => store } : name === "@/services/microStandardExportService" ? { microStandardExportEntries } : require(name) });
  const response = await route.GET(new Request("http://127.0.0.1/api/micro-standards/download?topic=" + encodeURIComponent("文案")));
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/zip");
  const zip = Buffer.from(await response.arrayBuffer());
  const extracted = await new Promise((resolve, reject) => require("yauzl").fromBuffer(zip, { lazyEntries: true }, (error, archive) => {
    if (error) return reject(error);
    const contents = {};
    archive.on("error", reject); archive.on("end", () => resolve(contents));
    archive.on("entry", entry => archive.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = []; stream.on("error", reject); stream.on("data", chunk => chunks.push(chunk));
      stream.on("end", () => { contents[entry.fileName] = Buffer.concat(chunks).toString("utf8"); archive.readEntry(); });
    })); archive.readEntry();
  }));
  assert.equal(extracted[entries[0].name], doc.content);
  assert.equal(JSON.parse(extracted["micro-standards.json"]).documents[0].id, doc.metadata.id);
  assert.equal((await route.GET(new Request("http://127.0.0.1/api/micro-standards/download?topic=unknown"))).status, 409);
  assert.deepEqual(JSON.parse((await microStandardExportEntries(store, "表单"))[0].content).topics, ["表单"]);
  await assert.rejects(microStandardExportEntries(store, "../outside"), /不存在/);
  const revision = (await store.list()).revision; let lists = 0;
  await assert.rejects(microStandardExportEntries({ list: async () => ({ ...(await store.list()), revision: revision + lists++ }), get: id => store.get(id) }), /发生变化/);
  await fs.writeFile(path.join(storage, entries[0].name), "tampered");
  await assert.rejects(microStandardExportEntries(store), /哈希改变/);
  console.log("PASS: real ZIP response/extraction, export filtering, safe paths, original body/IDs, empty folder, duplicate protection, revision and hash checks");
} finally { await fs.rm(temporary, { recursive: true, force: true }); }

// Execute the actual component handlers with controlled hooks and transport, without a running Hub.
async function component(file, name, supplied = {}) {
  const slots = [], effects = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(value) { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); },
    useMemo: action => action(), useEffect: action => { cursor++; effects.push(action); }
  };
  const dummy = new Proxy({}, { get: (_, key) => String(key) });
  const exports = {};
  vm.runInNewContext(await compile(file), { exports, require: module => {
    if (module === "react") return hooks;
    if (module === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (module === "antd") return { ...dummy, Button: "Button", Modal: "Modal", Select: "Select", Alert: "Alert", Space: "Space", Tag: "Tag", Progress: "Progress", Upload: { Dragger: "Dragger" } };
    if (module.endsWith(".css")) return {};
    if (module.includes("types/markdownKnowledge")) return { markdownKnowledgeRelatedScopes: [], markdownKnowledgeSpecTopics: [] };
    return supplied[module] ?? dummy;
  }, fetch: (...args) => supplied.fetch(...args), window: { addEventListener() {}, removeEventListener() {}, location: { assign: supplied.download ?? (() => {}) } }, requestAnimationFrame: action => action(), console, Set });
  return { render(props = {}) { cursor = 0; effects.length = 0; return exports[name](props); }, effects };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === "function" && tree.type.name === "Tree") return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.sidebar), ...nodes(tree.props?.footer)];
}
const leaf = (name, relativePath = name) => ({ name, relativePath, type: "file", size: 20, modifiedAt: new Date().toISOString() });
const snapshot = { rootAvailable: true, nodes: [{ name: "规范", relativePath: "规范", type: "directory", children: [leaf("颜色.md", "规范/颜色.md"), leaf("样例.svg", "规范/样例.svg")] }, leaf("SKILL.md")], manifest: [] };
const reads = [];
const skill = await component("src/components/haldur/HaldurDesignSkillWorkbench.tsx", "HaldurDesignSkillWorkbench", {
  "next/navigation": { useRouter: () => ({}) },
  fetch: async url => { reads.push(url); return { ok: true, json: async () => url.includes("files/content") ? { path: "规范/颜色.md", content: "# 颜色" } : snapshot }; }
});
skill.render(); skill.effects[0](); await new Promise(resolve => setTimeout(resolve, 0));
let tree = nodes(skill.render()); assert.ok(tree.some(node => node.props.title === "SKILL.md"));
tree.find(node => node.props["aria-label"] === "展开规范").props.onClick();
tree = nodes(skill.render());
assert.ok(tree.some(node => node.props.title === "颜色.md"));
await tree.find(node => node.props.title === "颜色.md").props.onClick({ currentTarget: {} });
await new Promise(resolve => setTimeout(resolve, 0));
tree = nodes(skill.render()); assert.ok(tree.some(node => node.props.document?.content === "# 颜色"));
assert.ok(reads.some(url => url.includes(encodeURIComponent("规范/颜色.md"))));
assert.equal(tree.find(node => node.props["aria-label"] === "收起规范").props["aria-expanded"], true);
tree.find(node => node.props.title === "样例.svg").props.onClick({ currentTarget: {} });
assert.ok(nodes(skill.render()).some(node => node.props.path === "规范/样例.svg"));
console.log("PASS: root/nested files, separate expansion, Markdown reading and SVG preview handlers");

let refreshes = 0; const uploads = [];
const queue = await component("src/components/micro-standards/MicroStandardsUploadQueue.tsx", "MicroStandardsUploadQueue", {
  fetch: async (_url, options) => { uploads.push(JSON.parse(options.body)); return uploads.length === 1 ? { ok: true, status: 201, json: async () => ({ metadata: { id: "new" } }) } : { ok: false, status: 500, json: async () => ({}) }; }
});
const props = { topics: ["文案"], initialTopic: "文案", onRefresh: () => refreshes++, onClose() {} };
let view = nodes(queue.render(props));
view.find(node => node.props["aria-label"] === "上传规范关联类目").props.onChange(["portal"]);
for (let i = 0; i < 3; i++) view.find(node => node.type === "Dragger").props.beforeUpload({ uid: String(i), name: `规则${i}.md`, size: 10, text: async () => "# 规则" });
view = nodes(queue.render(props));
const run = view.find(node => node.props.type === "primary").props.onClick;
run(); run(); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(uploads.length, 2); assert.equal(refreshes, 1);
assert.equal(uploads[0].specTopic, "文案"); assert.deepEqual(uploads[0].relatedScopes, ["portal"]);
assert.ok(nodes(queue.render(props)).some(node => node.props.children === "结果待核对"));
assert.ok(nodes(queue.render(props)).some(node => node.props.children === "成功"));
console.log("PASS: serial upload, duplicate-click guard, metadata, unknown-write pause, retained results and automatic refresh");
