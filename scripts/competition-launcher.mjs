import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { access, lstat, mkdir, open, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { initializeCompetitionData } from "./competition-first-run.mjs";
import { checkCompetitionEnvironment, portIsListening, readJson, toolPaths } from "./competition-check.mjs";
import { prepareCompetitionPackage } from "./competition-prepare-package.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { if (!Number.isInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
const jsonWrite = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });

export function localDistributionEnvironment(config, packageRoot, dataRoot, login = {}) {
  const tools = toolPaths(packageRoot), environment = {};
  for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "PATHEXT", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "USER", "LOGNAME"]) if (process.env[key]) environment[key] = process.env[key];
  const systemPaths = process.platform === "win32" ? [path.join(process.env.SystemRoot || "C:\\Windows", "System32"), process.env.SystemRoot || "C:\\Windows"] : ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  Object.assign(environment, config, login, {
    PATH: [path.dirname(tools.node), path.dirname(tools.git), ...systemPaths].join(path.delimiter), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull, GIT_OPTIONAL_LOCKS: "0",
    NODE_ENV: "production", UED_LOCAL_DISTRIBUTION_MODE: "true", UED_LOCAL_DISTRIBUTION_ROOT: dataRoot, UED_LOCAL_DISTRIBUTION_PACKAGE: packageRoot,
    HOST_BIND_HOST: "127.0.0.1", ADMIN_SESSION_SECURE: "false", PUBLIC_ORIGIN: `http://127.0.0.1:${config.HOST_PORT}`, UED_STAGING_SHUTDOWN_ENABLED: "true",
    TMP: path.join(config.ASSET_HUB_RUNTIME_DIR, "tmp"), TEMP: path.join(config.ASSET_HUB_RUNTIME_DIR, "tmp"), TMPDIR: path.join(config.ASSET_HUB_RUNTIME_DIR, "tmp")
  });
  if (process.platform === "darwin") environment.GIT_EXEC_PATH = path.join(packageRoot, "tools/git/libexec/git-core");
  return environment;
}

async function privateConfiguration(packageRoot, dataRoot, initialize = false, protectLogin = false) {
  if (process.platform === "win32") execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-File", path.join(packageRoot, "tools/competition-private-config.ps1"), "-Path", dataRoot, ...(initialize ? ["-Initialize"] : []), ...(protectLogin ? ["-ProtectLogin"] : [])], { stdio: ["ignore", "pipe", "pipe"] });
  else { const detail = await lstat(dataRoot); if (!detail.isDirectory() || detail.isSymbolicLink() || detail.uid !== process.getuid() || (detail.mode & 0o077)) throw new Error("外置数据根的账户权限不合规。"); }
}

export async function initializeLocalAdministrator(packageRoot, input) {
  if (typeof input.password !== "string" || input.password.length < 12 || typeof input.username !== "string" || !input.username.trim()) throw new Error("请设置管理员账号和至少12位的新密码。");
  packageRoot = (await checkCompetitionEnvironment(packageRoot)).root;
  await prepareCompetitionPackage(packageRoot);
  const result = await initializeCompetitionData({ packageRoot, dependencyRoot: path.join(packageRoot, "dependencies"), dataRoot: input.dataRoot, confirmed: true });
  await privateConfiguration(packageRoot, result.dataRoot, true);
  const login = { ADMIN_USERNAME: input.username.trim(), ADMIN_PASSWORD: input.password, ADMIN_SESSION_SECRET: randomBytes(32).toString("base64url"), AGENT_GATEWAY_TOKEN: randomBytes(32).toString("base64url"), TEST_ENV_ENCRYPTION_KEY: randomBytes(32).toString("base64url") };
  const environment = localDistributionEnvironment(result.environment, packageRoot, result.dataRoot, login);
  const { resolveHostSecurityConfig } = await import(pathToFileURL(path.join(packageRoot, "app/scripts/host-security-config.mjs")).href);
  resolveHostSecurityConfig(environment);
  await jsonWrite(path.join(path.dirname(result.configPath), "host-login.json"), login);
  await privateConfiguration(packageRoot, result.dataRoot, false, true);
  await jsonWrite(path.join(packageRoot, "installation.json"), { schemaVersion: 1, configPath: result.configPath });
  input.password = "";
}

async function request(origin, route, init = {}) {
  return fetch(origin + route, { ...init, headers: { Origin: origin, ...init.headers }, signal: AbortSignal.timeout(5000), redirect: "error" });
}
async function authenticate(origin, login) {
  const response = await request(origin, "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: login.ADMIN_USERNAME, password: login.ADMIN_PASSWORD }) });
  if (!response.ok) throw new Error("管理员登录失败，请检查本安装的受保护管理员配置。");
  const cookie = response.headers.get("set-cookie");
  if (!cookie || !/httponly/i.test(cookie) || !/samesite=lax/i.test(cookie) || /;\s*secure(?:;|$)/i.test(cookie)) throw new Error("本机登录 Cookie 属性不符合独立本机模式。");
  return cookie.split(";", 1)[0];
}
async function ownedHealth(origin, state) {
  if (!alive(state.pid)) return false;
  const response = await request(origin, "/api/auth/session");
  return response.ok && response.headers.get("x-ued-local-instance") === state.instance;
}
function openBrowser(url) {
  const child = process.platform === "win32" ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }) : spawn("/usr/bin/open", [url], { detached: true, stdio: "ignore" });
  child.on("error", () => console.log("浏览器未自动打开，请手动访问显示的本机地址。")); child.unref();
}

export async function runLocalDistribution(action, packageRoot, { open = true } = {}) {
  if (action === "Check") return checkCompetitionEnvironment(packageRoot);
  const checked = await checkCompetitionEnvironment(packageRoot);
  packageRoot = checked.root;
  await prepareCompetitionPackage(packageRoot);
  const locator = await readJson(path.join(packageRoot, "installation.json")), config = await readJson(locator.configPath), dataRoot = path.dirname(path.dirname(locator.configPath));
  await privateConfiguration(packageRoot, dataRoot);
  const loginPath = path.join(path.dirname(locator.configPath), "host-login.json"), info = await lstat(loginPath);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw new Error("管理员配置的文件权限不合规。");
  const login = await readJson(loginPath), environment = localDistributionEnvironment(config, packageRoot, dataRoot, login), origin = environment.PUBLIC_ORIGIN;
  const { resolveHostSecurityConfig } = await import(pathToFileURL(path.join(packageRoot, "app/scripts/host-security-config.mjs")).href); resolveHostSecurityConfig(environment);
  const lockPath = path.join(path.dirname(locator.configPath), "launcher.lock"), statePath = path.join(path.dirname(locator.configPath), "supervisor.json");
  try {
    const stale = await readJson(lockPath);
    if (alive(stale.pid)) throw new Error("本安装正在启动或停止，请稍后再试。");
    await unlink(lockPath);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = await open(lockPath, "wx", 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.close();
    let state = null;
    try { state = await readJson(statePath); if (state.packageRoot !== packageRoot) throw new Error("运行状态属于另一版本目录，请先按原版本入口受控停止。"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (state && !alive(state.pid)) {
      if (action === "Stop") throw new Error("原 Supervisor 已退出；保留状态供检查，不强杀任何进程。");
      await unlink(statePath); state = null;
    }
    if (action === "Start" && !state) {
      // The existing Supervisor checks all ports, ownership locks and managed orphans.
      await mkdir(environment.TEMP, { recursive: true, mode: 0o700 });
      state = { schemaVersion: 1, packageRoot, instance: randomBytes(24).toString("hex") };
      const child = spawn(toolPaths(packageRoot).node, [path.join(packageRoot, "app/scripts/start-host.mjs")], { cwd: path.join(packageRoot, "app"), env: { ...environment, UED_LOCAL_DISTRIBUTION_INSTANCE: state.instance }, detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", () => {});
      if (!child.pid) throw new Error("无法启动现有 Supervisor，请先运行环境检测。");
      state.pid = child.pid; child.unref(); await jsonWrite(statePath, state);
    }
    if (!state) throw new Error("本安装没有运行实例；未控制其他进程。");
    const deadline = Date.now() + 120_000;
    let cookie, runtime;
    while (Date.now() < deadline) {
      if (!alive(state.pid)) throw new Error("Supervisor 已退出。请检查依赖/端口及外置 Agent Runtime 的结构化诊断；不会自动重试或重建数据。");
      try {
        if (await ownedHealth(origin, state)) {
          cookie ||= await authenticate(origin, login);
          if (action === "Stop") break;
          const response = await request(origin, "/api/runtime/status", { headers: { Cookie: cookie } });
          runtime = (await response.json()).runtime;
          if (runtime.status === "ready" || (runtime.status === "configuration_required" && runtime.reasonCode === "credential_missing")) break;
          if (["error", "configuration_required"].includes(runtime.status)) break;
        }
      } catch {}
      await sleep(500);
    }
    if (!cookie || (action === "Start" && runtime?.status !== "ready" && runtime?.reasonCode !== "credential_missing")) throw new Error(`本安装未在限定时间达到就绪状态：${runtime?.reasonCode || "runtime_not_ready"}。保留诊断，不强杀或重复拉起。`);
    if (!await ownedHealth(origin, state)) throw new Error("本机地址与本安装身份不符，操作已拒绝。");
    if (action === "Start") {
      const url = origin + (runtime.reasonCode === "credential_missing" ? "/agent/settings" : "/");
      if (open) openBrowser(url);
      return { result: "PASS", url, runtime: runtime.status, source: checked.source };
    }
    const response = await request(origin, "/api/staging-shutdown", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error("原有鉴权停止接口拒绝操作；未强杀任何进程。");
    const stopDeadline = Date.now() + 100_000;
    while (alive(state.pid) && Date.now() < stopDeadline) await sleep(250);
    if (alive(state.pid)) throw new Error("受控停止尚未完成，请保留诊断；未执行强制终止。");
    for (const key of ["HOST_PORT", "HOST_INTERNAL_PORT", "DSH_PORT", "AGENT_PROXY_PORT", "KNOWLEDGE_GATEWAY_MCP_PORT"]) if (await portIsListening(config[key])) throw new Error("停止后仍有端口占用，已保留运行状态供核对；不会终止其他进程。");
    await unlink(statePath);
    return { result: "PASS", stopped: true };
  } finally { try { await lock.close(); } catch {} await unlink(lockPath); }
}

async function nativeMacSetup() {
  const script = 'const app=Application.currentApplication();app.includeStandardAdditions=true;const folder=app.chooseFolder({withPrompt:"Choose an external data parent folder"}).toString();const username=app.displayDialog("Administrator username",{defaultAnswer:"admin"}).textReturned;const password=app.displayDialog("New administrator password (at least 12 characters)",{defaultAnswer:"",hiddenAnswer:true}).textReturned;const confirm=app.displayDialog("Confirm administrator password",{defaultAnswer:"",hiddenAnswer:true}).textReturned;if(password!==confirm)throw Error("Passwords differ");JSON.stringify({dataRoot:folder+"/UED-Asset-Hub-Data",username,password});';
  return JSON.parse(execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, root] = process.argv.slice(2);
  try {
    if (action === "Init") {
      let input = ""; for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 16_384) throw new Error("初始化输入过长。"); }
      let setup;
      try { setup = JSON.parse(input); } catch { throw new Error("初始化输入无效；未输出或记录输入内容。"); }
      await initializeLocalAdministrator(root, setup); console.log("首次目录与管理员配置已完成；DeepSeek Key请在原后台设置。");
    } else {
      if (!["Start", "Stop", "Check"].includes(action)) throw new Error("无效的本机发行入口。");
      if (action === "Start") {
        try { await access(path.join(root, "installation.json")); }
        catch (error) { if (error.code !== "ENOENT") throw error; if (process.platform !== "darwin") throw new Error("请通过02启动入口完成首次配置。"); await initializeLocalAdministrator(root, await nativeMacSetup()); }
      }
      const result = await runLocalDistribution(action, root);
      console.log(action === "Check" ? result.message : action === "Start" ? `已启动：${result.url}` : "本安装已受控停止。");
    }
  } catch (error) { console.error(error.code === "ENOENT" ? "程序组件或原有数据路径缺失，请运行01检测；不会自动重建。" : error.message?.startsWith("Command failed") ? "本机权限或系统对话框操作失败；未绕过系统安全策略。" : error.message); process.exitCode = 1; }
}
