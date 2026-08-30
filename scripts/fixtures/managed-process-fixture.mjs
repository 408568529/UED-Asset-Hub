import { spawn } from "node:child_process";
import http from "node:http";

const options = new Map(process.argv.slice(2).flatMap((value, index, values) => value.startsWith("--") ? [[value.slice(2), values[index + 1] ?? ""]] : []));
const port = Number(options.get("port"));
const shutdownToken = options.get("shutdown-token");
const ignoreShutdown = options.get("ignore-shutdown") === "true";
const withDescendant = options.get("with-descendant") === "true";
let descendant = null;

if (withDescendant) descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });

const server = http.createServer((_request, response) => { response.writeHead(200); response.end("ok"); });
server.listen(port, "127.0.0.1", () => process.send?.({ type: "ready", pid: process.pid, descendantPid: descendant?.pid ?? null }));

async function shutdown() {
  if (ignoreShutdown) return;
  descendant?.kill();
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}

process.on("message", (message) => {
  if (message?.type === "managed-graceful-shutdown" && message.token === shutdownToken) void shutdown();
});
process.on("SIGTERM", () => { void shutdown(); });
