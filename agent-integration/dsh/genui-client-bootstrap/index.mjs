import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const inject = ["webServer", "clientModules"];
const clientId = "dsh-plugin-genui";
const clientPath = "/plugins/ued-genui-client/client.js";
const acceptedHash = "2cc6256717f1265494a125914e063082c5061a395cf44596fa720243e5cfd6eb";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function addGenuiClient(graph, manifest, bytes) {
  if (manifest.name !== clientId || manifest.version !== "0.15.1" || hash(bytes) !== acceptedHash) {
    throw new Error("GenUI bootstrap requires the pinned 0.15.1 client and approved compatibility patch.");
  }
  if (graph.entries.some((entry) => entry.id === clientId)) return graph;
  const declaration = manifest.dsh.client;
  const entries = [...graph.entries, {
    id: clientId, url: clientPath, rev: hash(bytes).slice(0, 12),
    inject: declaration.inject, external: declaration.external ?? [], immediately: false
  }];
  return { ...graph, entries, rev: hash(JSON.stringify(entries)).slice(0, 12) };
}

// Browser renderer only. Tools, artifact routes and grants remain owned by
// the explicitly selected restricted preset; no model/session work is run here.
export function apply(ctx) {
  const require = createRequire(import.meta.url);
  let packagePath;
  try { packagePath = require.resolve("dsh-plugin-genui/package.json"); }
  catch (error) { if (error.code === "MODULE_NOT_FOUND") return; throw error; }
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  const bytes = readFileSync(path.join(path.dirname(packagePath), "lib/client.js"));
  addGenuiClient({ entries: [] }, manifest, bytes);
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: clientPath, handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "Content-Length": bytes.length });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } }), "Asset Hub pinned GenUI client bundle");
  ctx.on("webserver/index-inject", (table) => {
    const boot = table.find((row) => row.kind === "global" && row.name === "__DSH_BOOT__");
    if (boot) boot.value = addGenuiClient(boot.value, manifest, bytes);
  });
}
