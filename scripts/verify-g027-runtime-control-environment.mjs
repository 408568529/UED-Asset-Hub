import assert from "node:assert/strict";
import { runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";
import { withRuntimeControlEnvironment } from "./host-supervisor.mjs";

function assetHubEnvironment({ host, port }) {
  return runtimeEnvironmentProfiles.assetHub({ NODE_ENV: "production" }, {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "test-password",
    ADMIN_SESSION_SECRET: "test-session-secret",
    HOSTNAME: host,
    PORT: String(port)
  });
}

for (const fixture of [{ host: "127.0.0.1", port: 3028 }, { host: "localhost", port: 41239 }]) {
  const initial = assetHubEnvironment(fixture);
  const resolved = withRuntimeControlEnvironment(initial, { endpoint: "runtime-control-endpoint", token: "runtime-control-token" });
  assert.equal(resolved.HOSTNAME, fixture.host, "Runtime Control must preserve the resolved Asset Hub bind host");
  assert.equal(resolved.PORT, String(fixture.port), "Runtime Control must preserve the resolved Asset Hub bind port");
  assert.equal(resolved.RUNTIME_CONTROL_ENDPOINT, "runtime-control-endpoint");
  assert.equal(resolved.RUNTIME_CONTROL_TOKEN, "runtime-control-token");
}

console.log("[G-027] Runtime Control preserves the resolved Asset Hub host and port.");
