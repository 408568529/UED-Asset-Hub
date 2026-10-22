import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

export const toolPaths = (root) => process.platform === "win32"
  ? { node: path.join(root, "tools/node/node.exe"), git: path.join(root, "tools/git/cmd/git.exe") }
  : { node: path.join(root, "tools/node/bin/node"), git: path.join(root, "tools/git/bin/git") };
export const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
const hashFile = async (file) => { const hash = createHash("sha256"); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest("hex"); };
export const portIsListening = (port) => new Promise((resolve, reject) => {
  const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
  socket.setTimeout(1000);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", (error) => error.code === "ECONNREFUSED" ? resolve(false) : reject(error));
  socket.once("timeout", () => { socket.destroy(); reject(new Error("本机端口检查超时，请确认本机网络策略后重检。")); });
});

export async function verifyCompetitionFiles(packageRoot) {
  const root = await realpath(packageRoot), manifest = await readJson(path.join(root, "competition-manifest.json"));
  if (manifest.schemaVersion !== 1 || manifest.channel !== "V2.5_COMPETITION" || manifest.platform !== `${process.platform}-${process.arch}` || manifest.nodeVersion !== "22.23.2" || !Array.isArray(manifest.files) || ![manifest.sourceLinks, manifest.runtimeLinks, manifest.profileLinks].every(Array.isArray)) throw new Error("系统/架构或发行清单不匹配，请使用对应平台的完整 ZIP。");
  const seen = new Set(), parents = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || file.path.includes("\\") || file.path.includes(":") || file.path.split("/").some((part) => !part || part === "." || part === "..") || seen.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("包清单含非法或重复路径，请重新取得完整 ZIP。");
    seen.add(file.path.toLowerCase());
    const target = path.join(root, ...file.path.split("/")), parent = path.dirname(target);
    if (!parents.has(parent)) { if (await realpath(parent) !== parent) throw new Error("程序文件父目录被链接重定向，请重新解压到独立目录。"); parents.add(parent); }
    const detail = await lstat(target);
    if (!detail.isFile() || detail.isSymbolicLink() || detail.size !== file.size || await hashFile(target) !== file.sha256) throw new Error(`组件缺失或哈希不匹配：${file.path}。请重新解压，勿混用旧版本。`);
  }
  for (const required of [process.platform === "win32" ? "tools/node/node.exe" : "tools/node/bin/node", "app/server.js", "tools/competition-launcher.mjs", "tools/competition-check.mjs", "tools/competition-prepare-package.mjs"]) if (!seen.has(required.toLowerCase())) throw new Error("发行清单缺少必要入口，请重新取得完整 ZIP。");
  for (const required of ["dependencies/dsh-source/.git/HEAD", "dependencies/dsh-runtime/apps/cli/src/bin.ts", "dependencies/dsh-runtime/.dsh-build/client-build-environment.json", "dependencies/genui-home/profiles/web/package.json"]) if (!seen.has(required.toLowerCase())) throw new Error(`必要运行构件缺失：${required}。请重新取得构建完成的完整包。`);
  const dshPackage = await readJson(path.join(root, "dependencies/dsh-runtime/package.json"));
  const genui = manifest.files.find((file) => file.path.startsWith("dependencies/genui-home/") && file.path.endsWith("/node_modules/dsh-plugin-genui/package.json"));
  if (dshPackage.version !== "0.1.1-rc.2" || !genui || (await readJson(path.join(root, genui.path))).version !== "0.15.1" || !manifest.files.some((file) => file.path.startsWith("dependencies/genui-home/") && file.path.endsWith("/esbuild-wasm/esbuild.wasm"))) throw new Error("DSH/GenUI版本或完整运行依赖不匹配，不能通过临时安装补齐。");
  return { root, manifest };
}

export async function checkCompetitionEnvironment(packageRoot, { onProgress = () => {}, installationConfigPath } = {}) {
  onProgress("integrity", "RUNNING", "正在核对全部构件与 SHA-256；不读取凭据。");
  const { root, manifest } = await verifyCompetitionFiles(packageRoot), tools = toolPaths(root);
  onProgress("integrity", "PASS", `Hub / DSH / GenUI Web profile，${manifest.files.length} 个文件已校验。`);
  onProgress("system", "PASS", manifest.platform);
  onProgress("node", "RUNNING", "核对包内 Node。");
  if (process.versions.node !== manifest.nodeVersion) throw new Error("请使用包内 Node 执行入口，不使用系统 Node。");
  await Promise.all([access(tools.node, constants.X_OK), access(tools.git, constants.X_OK)]);
  onProgress("node", "PASS", `Node ${process.versions.node}`);
  onProgress("git", "RUNNING", "核对便携 Git 和必要权限。");
  const gitVersion = execFileSync(tools.git, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (gitVersion !== `git version ${manifest.gitVersion}`) throw new Error("便携 Git 版本不匹配，请重新解压完整包。");
  if (process.platform === "win32") {
    if (path.parse(root).root.toLowerCase() === `${(process.env.SystemDrive || "C:").toLowerCase()}\\`) throw new Error("请将程序与数据放在 C 盘之外。");
    if ([...manifest.sourceLinks, ...manifest.runtimeLinks, ...manifest.profileLinks].some((link) => link.kind === "file")) {
      const privileges = execFileSync("whoami.exe", ["/priv", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      let developerMode = false;
      try { developerMode = /0x1\b/.test(execFileSync("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock", "/v", "AllowDevelopmentWithoutDevLicense"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); } catch {}
      if (!developerMode && !privileges.includes("SeCreateSymbolicLinkPrivilege")) throw new Error("现有 DSH 来源校验需要 Windows 文件符号链接权限。当前账户不具备；请由系统管理员配置受允许的权限后重检，检测器不会自行修改系统策略。");
    }
  }
  onProgress("git", "PASS", gitVersion);
  onProgress("data", "RUNNING", "检查保存的路径与权限；不读取管理员或模型凭据内容。");
  // Read only the path locator and non-secret path configuration. Never read host-login or DSH credentials.
  let config = { HOST_PORT: "3247", HOST_INTERNAL_PORT: "3248", DSH_PORT: "3347", AGENT_PROXY_PORT: "3348", KNOWLEDGE_GATEWAY_MCP_PORT: "3349" }, state;
  let configPath;
  try {
    const locator = installationConfigPath ? { schemaVersion: 1, configPath: installationConfigPath } : await readJson(path.join(root, "installation.json"));
    if (locator.schemaVersion !== 1 || typeof locator.configPath !== "string" || !path.isAbsolute(locator.configPath) || path.basename(locator.configPath) !== "runtime.json" || path.basename(path.dirname(locator.configPath)) !== "config") throw new Error("安装路径记录无效。");
    if ((await lstat(locator.configPath)).isSymbolicLink() || await realpath(locator.configPath) !== path.resolve(locator.configPath)) throw new Error("保存的非敏感路径配置被链接重定向。");
    config = await readJson(locator.configPath);
    configPath = locator.configPath;
    for (const key of [...(config.MICRO_STANDARD_ROOT ? ["MICRO_STANDARD_ROOT"] : []), "DATA_DIR", "TRAINING_MEDIA_DIR", "AGENT_RUNTIME_DIR", "ASSET_HUB_RUNTIME_DIR", "HALDUR_DESIGN_SKILL_ROOT", "HALDUR_DESIGN_SKILL_RUNTIME_ROOT"]) {
      if (!path.isAbsolute(config[key]) || !(await lstat(config[key])).isDirectory() || await realpath(config[key]) !== path.resolve(config[key])) throw new Error("保存的数据目录不存在或被链接替换；请恢复原路径，不会自动重建。");
    }
    const login = await lstat(path.join(path.dirname(locator.configPath), "host-login.json"));
    if (!login.isFile() || login.isSymbolicLink() || (process.platform !== "win32" && (login.uid !== process.getuid() || (login.mode & 0o077)))) throw new Error("管理员配置的所有权/权限不合规；请恢复本安装配置及私有访问权限。");
    if (process.platform === "win32") execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-File", path.join(root, "tools/competition-private-config.ps1"), "-Path", path.dirname(path.dirname(locator.configPath))], { stdio: ["ignore", "pipe", "pipe"] });
    try { state = await readJson(path.join(path.dirname(locator.configPath), "supervisor.json")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  } catch (error) {
    if (error.code !== "ENOENT" || error.path !== path.join(root, "installation.json")) throw error;
  }
  onProgress("data", configPath ? "PASS" : "NOT_CONFIGURED", configPath ? path.dirname(path.dirname(configPath)) : "尚未选择外置数据目录；不会自动初始化。");
  onProgress("ports", "RUNNING", "核对五个端口和运行实例身份。");
  const ports = ["HOST_PORT", "HOST_INTERNAL_PORT", "DSH_PORT", "AGENT_PROXY_PORT", "KNOWLEDGE_GATEWAY_MCP_PORT"].map((key) => Number(config[key]));
  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== 5) throw new Error("本安装端口配置无效或重复，请恢复原配置。");
  let owned = false;
  if (state?.packageRoot === root && state.instance) {
    try { process.kill(state.pid, 0); const response = await fetch(`http://127.0.0.1:${config.HOST_PORT}/api/auth/session`, { signal: AbortSignal.timeout(1500) }); owned = response.ok && response.headers.get("x-ued-local-instance") === state.instance; } catch {}
  }
  for (const port of ports) if (await portIsListening(port) && !owned) throw new Error(`端口${port}已被其他实例占用。请选择不冲突的本安装端口，不会停止或清理其他进程。`);
  onProgress("ports", "PASS", `${ports.join(" / ")}${owned ? "；同一安装已运行" : "；无冲突"}`);
  return { result: "PASS", root, platform: manifest.platform, source: manifest.source, fileCount: manifest.files.length, configured: Boolean(configPath), dataRoot: configPath ? path.dirname(path.dirname(configPath)) : null, owned, mode:state?.mode||"local", origin:owned?state?.origin:undefined, ports, message: "可以启动（首次启动将配置外部目录及管理员）", newMachineAcceptance: manifest.newMachineAcceptance };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await checkCompetitionEnvironment(process.argv[2]))); }
  catch (error) { console.error(error.code === "ENOENT" ? "必要组件或保存路径缺失，请恢复完整程序包/原数据目录后重检。" : error.message); process.exitCode = 1; }
}
