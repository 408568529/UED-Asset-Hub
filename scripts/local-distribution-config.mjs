import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const children = {
  DATA_DIR: "hub-data", TRAINING_MEDIA_DIR: "training-media", AGENT_RUNTIME_DIR: "agent-runtime",
  ASSET_HUB_RUNTIME_DIR: "asset-hub-runtime", HALDUR_DESIGN_SKILL_ROOT: "Haldur-Design-Skill",
  HALDUR_DESIGN_SKILL_RUNTIME_ROOT: "haldur-runtime"
};
const inside = (root, child) => { const relative = path.relative(root, child); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };

export function isLocalDistributionEnvironment(environment = process.env) {
  if (environment.UED_LOCAL_DISTRIBUTION_MODE !== "true" || environment.NODE_ENV !== "production"
    || environment.UED_WINDOWS_SERVICE_MODE === "true" || environment.UED_LOCAL_TEST_MODE === "true" || environment.UED_LOCAL_DEMO_MODE === "true"
    || environment.HOST_BIND_HOST !== "127.0.0.1" || environment.ADMIN_SESSION_SECURE !== "false") return false;
  const port = environment.HOST_PORT;
  if (!/^[1-9]\d{0,4}$/.test(port || "") || Number(port) > 65535 || environment.PUBLIC_ORIGIN !== `http://127.0.0.1:${port}`) return false;
  try {
    const root = environment.UED_LOCAL_DISTRIBUTION_ROOT, packageRoot = environment.UED_LOCAL_DISTRIBUTION_PACKAGE;
    if (!root || !packageRoot || !path.isAbsolute(root) || !path.isAbsolute(packageRoot) || realpathSync(root) !== path.resolve(root) || realpathSync(packageRoot) !== path.resolve(packageRoot)) return false;
    if (inside(root, packageRoot) || inside(packageRoot, root)) return false;
    for (const [key, child] of Object.entries(children)) {
      const expected = path.join(root, child);
      if ((environment[key] && path.resolve(environment[key]) !== expected) || realpathSync(expected) !== expected) return false;
    }
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "competition-manifest.json"), "utf8"));
    const release = JSON.parse(readFileSync(path.join(packageRoot, "app/release-manifest.json"), "utf8"));
    return manifest.channel === "V2.5_COMPETITION" && manifest.platform === `${process.platform}-${process.arch}`
      && /^[a-f0-9]{40}$/.test(manifest.source?.commit || "") && manifest.source.commit === release.source?.commit && manifest.source.tree === release.source?.tree;
  } catch { return false; }
}

export function acceptsLocalDistributionRequest(request, environment = process.env) {
  if (environment.UED_LOCAL_DISTRIBUTION_MODE !== "true") return true;
  const header = (name) => typeof request.headers.get === "function" ? request.headers.get(name) : request.headers[name];
  const expectedHost = `127.0.0.1:${environment.HOST_PORT}`;
  if (header("host") !== expectedHost) return false;
  const origin = header("origin");
  if (origin && origin !== `http://${expectedHost}`) return false;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method || "GET") && origin !== `http://${expectedHost}`) return false;
  if (header("sec-fetch-site") && !["same-origin", "none"].includes(header("sec-fetch-site"))) return false;
  if (header("x-forwarded-host") && header("x-forwarded-host") !== expectedHost) return false;
  return !header("x-forwarded-proto") || header("x-forwarded-proto") === "http";
}
